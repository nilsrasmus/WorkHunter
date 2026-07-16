use genpdf::elements::{Break, LinearLayout, Paragraph};
use genpdf::fonts::{FontData, FontFamily};
use genpdf::style::Style;
use genpdf::{Document, Element, SimplePageDecorator};
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};

#[derive(Debug, Clone, Default)]
struct FragmentStyle {
    bold: bool,
    italic: bool,
    font_size: Option<u8>,
}

#[derive(Debug, Clone)]
struct Fragment {
    text: String,
    style: FragmentStyle,
}

/// One or more lines; line breaks inside a paragraph become separate entries.
type RichText = Vec<Vec<Fragment>>;

#[derive(Debug)]
enum Block {
    Heading(u8, RichText),
    Paragraph(RichText),
    Bullet(RichText),
    Numbered(usize, RichText),
    Code(String),
    Rule,
}

struct MarkdownPdfParser {
    blocks: Vec<Block>,
    style_stack: Vec<FragmentStyle>,
    block_font_size: Option<u8>,
    in_code_block: bool,
    list_ordered: bool,
    list_item_number: usize,
    current_line: Vec<Fragment>,
    current_lines: RichText,
    current_text: String,
    heading_level: u8,
}

impl MarkdownPdfParser {
    fn new() -> Self {
        Self {
            blocks: Vec::new(),
            style_stack: Vec::new(),
            block_font_size: None,
            in_code_block: false,
            list_ordered: false,
            list_item_number: 1,
            current_line: Vec::new(),
            current_lines: Vec::new(),
            current_text: String::new(),
            heading_level: 1,
        }
    }

    fn current_style(&self) -> FragmentStyle {
        let mut merged = FragmentStyle {
            font_size: self.block_font_size,
            ..Default::default()
        };
        for layer in &self.style_stack {
            if layer.bold {
                merged.bold = true;
            }
            if layer.italic {
                merged.italic = true;
            }
            if let Some(size) = layer.font_size {
                merged.font_size = Some(size);
            }
        }
        merged
    }

    fn flush_text(&mut self) {
        if self.current_text.is_empty() {
            return;
        }
        self.current_line.push(Fragment {
            text: std::mem::take(&mut self.current_text),
            style: self.current_style(),
        });
    }

    fn flush_line(&mut self) {
        self.flush_text();
        if !self.current_line.is_empty() {
            self.current_lines.push(std::mem::take(&mut self.current_line));
        }
    }

    fn is_empty_rich_text(text: &RichText) -> bool {
        text.iter().all(|line| line.iter().all(|f| f.text.trim().is_empty()))
    }

    fn take_rich_text(&mut self) -> RichText {
        self.flush_line();
        let mut lines = std::mem::take(&mut self.current_lines);
        lines.retain(|line| !line.iter().all(|f| f.text.trim().is_empty()));
        lines
    }

    fn push_style_layer(&mut self, layer: FragmentStyle) {
        self.flush_text();
        self.style_stack.push(layer);
    }

    fn pop_style_layer(&mut self) {
        self.flush_text();
        self.style_stack.pop();
    }

    fn append_text(&mut self, text: &str) {
        if self.in_code_block {
            self.current_text.push_str(text);
            return;
        }
        let parts: Vec<&str> = text.split('\n').collect();
        for (i, part) in parts.iter().enumerate() {
            if i > 0 {
                self.flush_line();
            }
            if !part.is_empty() {
                self.current_text.push_str(part);
            }
        }
    }

    fn line_break(&mut self) {
        if self.in_code_block {
            self.current_text.push('\n');
            return;
        }
        self.flush_line();
    }

    fn heading_size(level: u8) -> u8 {
        match level {
            1 => 16,
            2 => 14,
            3 => 13,
            4 => 12,
            _ => 11,
        }
    }

    fn parse(mut self, markdown: &str) -> Vec<Block> {
        let mut options = Options::empty();
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_GFM);

        let normalized = normalize_editor_line_breaks(markdown);

        for event in Parser::new_ext(&normalized, options) {
            self.handle_event(event);
        }

        if self.in_code_block {
            let text = self.current_text.trim_end().to_string();
            if !text.is_empty() {
                self.blocks.push(Block::Code(text));
            }
        } else {
            let rich = self.take_rich_text();
            if !Self::is_empty_rich_text(&rich) {
                self.blocks.push(Block::Paragraph(rich));
            }
        }

        self.blocks
    }

    fn handle_event(&mut self, event: Event<'_>) {
        match event {
            Event::Start(Tag::Heading { level, .. }) if !self.in_code_block => {
                let rich = self.take_rich_text();
                if !Self::is_empty_rich_text(&rich) {
                    self.blocks.push(Block::Paragraph(rich));
                }
                self.heading_level = level as u8;
                self.block_font_size = Some(Self::heading_size(self.heading_level));
            }
            Event::End(TagEnd::Heading(_)) if !self.in_code_block => {
                let rich = self.take_rich_text();
                if !Self::is_empty_rich_text(&rich) {
                    self.blocks.push(Block::Heading(self.heading_level, rich));
                }
                self.block_font_size = None;
            }
            Event::Start(Tag::Paragraph) if !self.in_code_block => {
                let rich = self.take_rich_text();
                if !Self::is_empty_rich_text(&rich) {
                    self.blocks.push(Block::Paragraph(rich));
                }
            }
            Event::End(TagEnd::Paragraph) if !self.in_code_block => {
                let rich = self.take_rich_text();
                if !Self::is_empty_rich_text(&rich) {
                    self.blocks.push(Block::Paragraph(rich));
                }
            }
            Event::Start(Tag::List(kind)) if !self.in_code_block => {
                self.list_ordered = kind.is_some();
                self.list_item_number = 1;
            }
            Event::Start(Tag::Item) if !self.in_code_block => {
                self.current_lines.clear();
                self.current_line.clear();
                self.current_text.clear();
            }
            Event::End(TagEnd::Item) if !self.in_code_block => {
                let rich = self.take_rich_text();
                if !Self::is_empty_rich_text(&rich) {
                    if self.list_ordered {
                        self.blocks.push(Block::Numbered(self.list_item_number, rich));
                        self.list_item_number += 1;
                    } else {
                        self.blocks.push(Block::Bullet(rich));
                    }
                }
            }
            Event::Start(Tag::CodeBlock(_)) => {
                let rich = self.take_rich_text();
                if !Self::is_empty_rich_text(&rich) {
                    self.blocks.push(Block::Paragraph(rich));
                }
                self.in_code_block = true;
                self.current_text.clear();
            }
            Event::End(TagEnd::CodeBlock) => {
                let text = self.current_text.trim_end().to_string();
                if !text.is_empty() {
                    self.blocks.push(Block::Code(text));
                }
                self.current_text.clear();
                self.in_code_block = false;
            }
            Event::Start(Tag::BlockQuote(_)) if !self.in_code_block => {
                self.append_text("> ");
            }
            Event::Rule if !self.in_code_block => {
                let rich = self.take_rich_text();
                if !Self::is_empty_rich_text(&rich) {
                    self.blocks.push(Block::Paragraph(rich));
                }
                self.blocks.push(Block::Rule);
            }
            Event::Start(Tag::Strong) if !self.in_code_block => {
                self.push_style_layer(FragmentStyle {
                    bold: true,
                    ..Default::default()
                });
            }
            Event::End(TagEnd::Strong) if !self.in_code_block => {
                self.pop_style_layer();
            }
            Event::Start(Tag::Emphasis) if !self.in_code_block => {
                self.push_style_layer(FragmentStyle {
                    italic: true,
                    ..Default::default()
                });
            }
            Event::End(TagEnd::Emphasis) if !self.in_code_block => {
                self.pop_style_layer();
            }
            Event::Text(text) => self.append_text(&text),
            Event::Code(text) => {
                if self.in_code_block {
                    self.append_text(&text);
                } else {
                    self.flush_text();
                    self.current_line.push(Fragment {
                        text: text.to_string(),
                        style: FragmentStyle {
                            font_size: Some(10),
                            ..self.current_style()
                        },
                    });
                }
            }
            Event::SoftBreak | Event::HardBreak => self.line_break(),
            Event::Start(Tag::Link { .. }) | Event::End(TagEnd::Link) => {}
            _ => {}
        }
    }
}

fn normalize_editor_line_breaks(markdown: &str) -> String {
    // Preserve paragraph breaks, then turn single newlines into CommonMark soft breaks
    // (two trailing spaces) so shift+enter in the editor becomes a visible line break.
    const PARA: &str = "\u{0000}PARA\u{0000}";
    markdown
        .replace("\r\n", "\n")
        .replace("\n\n", PARA)
        .replace('\n', "  \n")
        .replace(PARA, "\n\n")
}

fn parse_markdown_blocks(markdown: &str) -> Vec<Block> {
    let normalized = normalize_editor_line_breaks(markdown);
    MarkdownPdfParser::new().parse(&normalized)
}

fn load_font_family() -> Result<FontFamily<FontData>, String> {
    let regular = FontData::new(
        include_bytes!("../../fonts/DejaVuSans.ttf").to_vec(),
        None,
    )
    .map_err(|e| format!("Failed to load regular font: {e}"))?;
    let bold = FontData::new(
        include_bytes!("../../fonts/DejaVuSans-Bold.ttf").to_vec(),
        None,
    )
    .map_err(|e| format!("Failed to load bold font: {e}"))?;
    Ok(FontFamily {
        regular: regular.clone(),
        bold: bold.clone(),
        italic: regular,
        bold_italic: bold,
    })
}

fn fragment_style(base_size: u8, fragment: &FragmentStyle) -> Style {
    let size = fragment.font_size.unwrap_or(base_size);
    let mut style = Style::new().with_font_size(size);
    if fragment.bold {
        style = style.bold();
    }
    if fragment.italic {
        style = style.italic();
    }
    style
}

fn render_rich_text(layout: &mut LinearLayout, rich: &RichText, base_size: u8) {
    if rich.is_empty() {
        return;
    }
    let tight = Style::new().with_font_size(base_size).with_line_spacing(1.0);
    for line in rich {
        if line.is_empty() {
            continue;
        }
        let mut paragraph = Paragraph::default();
        for fragment in line {
            if fragment.text.is_empty() {
                continue;
            }
            paragraph.push_styled(
                fragment.text.clone(),
                fragment_style(base_size, &fragment.style),
            );
        }
        // Stack lines back-to-back — no Break between soft-break lines.
        layout.push(paragraph.styled(tight));
    }
}

fn prefix_first_line(rich: &mut RichText, prefix: &str) {
    if let Some(first_line) = rich.first_mut() {
        if let Some(first_frag) = first_line.first_mut() {
            first_frag.text = format!("{prefix}{}", first_frag.text);
        } else {
            first_line.push(Fragment {
                text: prefix.to_string(),
                style: FragmentStyle::default(),
            });
        }
    } else {
        rich.push(vec![Fragment {
            text: prefix.to_string(),
            style: FragmentStyle::default(),
        }]);
    }
}

fn render_blocks(layout: &mut LinearLayout, blocks: &[Block]) {
    for block in blocks {
        match block {
            Block::Heading(level, rich) => {
                layout.push(Break::new(2));
                render_rich_text(layout, rich, MarkdownPdfParser::heading_size(*level));
            }
            Block::Paragraph(rich) => {
                layout.push(Break::new(1));
                render_rich_text(layout, rich, 11);
            }
            Block::Bullet(rich) => {
                layout.push(Break::new(1));
                let mut prefixed = rich.clone();
                prefix_first_line(&mut prefixed, "• ");
                render_rich_text(layout, &prefixed, 11);
            }
            Block::Numbered(n, rich) => {
                layout.push(Break::new(1));
                let mut prefixed = rich.clone();
                prefix_first_line(&mut prefixed, &format!("{n}. "));
                render_rich_text(layout, &prefixed, 11);
            }
            Block::Code(text) => {
                layout.push(Break::new(2));
                for line in text.lines() {
                    let line_text = if line.is_empty() {
                        " ".to_string()
                    } else {
                        line.to_string()
                    };
                    layout.push(
                        Paragraph::new(line_text).styled(Style::new().with_font_size(10)),
                    );
                }
            }
            Block::Rule => layout.push(Break::new(4)),
        }
    }
}

pub fn markdown_to_pdf_base64(_title: &str, markdown: &str) -> Result<String, String> {
    let pdf_bytes = markdown_to_pdf_bytes(markdown)?;
    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &pdf_bytes,
    ))
}

pub fn markdown_to_pdf_bytes(markdown: &str) -> Result<Vec<u8>, String> {
    let font_family = load_font_family()?;
    let mut doc = Document::new(font_family);

    let mut decorator = SimplePageDecorator::new();
    decorator.set_margins(15);
    doc.set_page_decorator(decorator);

    let mut layout = LinearLayout::vertical();

    let blocks = parse_markdown_blocks(markdown);
    if blocks.is_empty() && !markdown.trim().is_empty() {
        let fallback = vec![vec![Fragment {
            text: markdown.trim().to_string(),
            style: FragmentStyle::default(),
        }]];
        render_rich_text(&mut layout, &fallback, 11);
    } else {
        render_blocks(&mut layout, &blocks);
    }

    doc.push(layout);

    let mut buf = Vec::new();
    doc.render(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf)
}

#[tauri::command]
pub fn generate_pdf_base64(title: String, markdown: String) -> Result<String, String> {
    markdown_to_pdf_base64(&title, &markdown)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pdf_has_reasonable_size() {
        let md = "# Experience\n\n**Senior developer** with ten years in the field.\n\n- Built systems with **Rust**\n- Led a team of 5";
        let bytes = markdown_to_pdf_bytes(md).expect("pdf");
        assert!(bytes.starts_with(b"%PDF"));
        assert!(bytes.len() > 2_000);
    }

    #[test]
    fn parses_soft_line_breaks() {
        let blocks = parse_markdown_blocks("Line one  \nLine two");
        assert!(blocks.iter().any(|b| {
            if let Block::Paragraph(rich) = b {
                rich.len() >= 2
            } else {
                false
            }
        }));
    }

    #[test]
    fn parses_bold_inline() {
        let blocks = parse_markdown_blocks("Hello **world**!");
        let has_bold = blocks.iter().any(|b| {
            if let Block::Paragraph(rich) = b {
                rich.iter()
                    .flatten()
                    .any(|f| f.style.bold && f.text.contains("world"))
            } else {
                false
            }
        });
        assert!(has_bold);
    }
}
