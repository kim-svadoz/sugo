export type SyntaxTokenKind = "plain" | "keyword" | "type" | "annotation" | "string" | "number" | "comment" | "operator";

export interface SyntaxToken {
  text: string;
  kind: SyntaxTokenKind;
}

const keywords = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "final", "finally", "for", "from", "fun",
  "if", "implements", "import", "in", "instanceof", "interface", "let", "native", "new", "null", "of",
  "package", "private", "protected", "public", "record", "return", "sealed", "static", "super", "switch",
  "synchronized", "this", "throw", "throws", "transient", "true", "try", "typeof", "val", "var", "void",
  "volatile", "when", "while", "with", "yield",
]);

const builtinTypes = new Set([
  "boolean", "byte", "char", "double", "float", "int", "long", "short", "String", "Object", "Class",
  "List", "Map", "Set", "Collection", "Optional", "Stream", "Integer", "Long", "Double", "Boolean", "Void",
]);

const highlightedLanguages = new Set(["JAVA", "KOTLIN", "JS", "JSX", "TS", "TSX", "PYTHON", "JSON", "YAML", "SQL", "CSS"]);

function push(tokens: SyntaxToken[], text: string, kind: SyntaxTokenKind) {
  if (!text) return;
  const previous = tokens.at(-1);
  if (previous?.kind === kind) previous.text += text;
  else tokens.push({ text, kind });
}

export function tokenizeCodeLines(lines: string[], language: string): SyntaxToken[][] {
  if (!highlightedLanguages.has(language)) return lines.map((line) => [{ text: line, kind: "plain" }]);
  let inBlockComment = false;

  return lines.map((line) => {
    const tokens: SyntaxToken[] = [];
    let cursor = 0;
    while (cursor < line.length) {
      if (inBlockComment) {
        const end = line.indexOf("*/", cursor);
        if (end < 0) {
          push(tokens, line.slice(cursor), "comment");
          cursor = line.length;
          continue;
        }
        push(tokens, line.slice(cursor, end + 2), "comment");
        cursor = end + 2;
        inBlockComment = false;
        continue;
      }

      if (line.startsWith("/*", cursor)) {
        const end = line.indexOf("*/", cursor + 2);
        if (end < 0) {
          push(tokens, line.slice(cursor), "comment");
          inBlockComment = true;
          break;
        }
        push(tokens, line.slice(cursor, end + 2), "comment");
        cursor = end + 2;
        continue;
      }
      if (line.startsWith("//", cursor) || ((language === "PYTHON" || language === "YAML") && line[cursor] === "#")) {
        push(tokens, line.slice(cursor), "comment");
        break;
      }

      const char = line[cursor];
      if (char === '"' || char === "'" || char === "`") {
        let end = cursor + 1;
        while (end < line.length) {
          if (line[end] === "\\") end += 2;
          else if (line[end++] === char) break;
        }
        push(tokens, line.slice(cursor, end), "string");
        cursor = end;
        continue;
      }

      const rest = line.slice(cursor);
      const annotation = rest.match(/^@[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/)?.[0];
      if (annotation) {
        push(tokens, annotation, "annotation");
        cursor += annotation.length;
        continue;
      }
      const number = rest.match(/^\b(?:0[xX][\dA-Fa-f]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)[fFdDlL]?\b/)?.[0];
      if (number) {
        push(tokens, number, "number");
        cursor += number.length;
        continue;
      }
      const word = rest.match(/^[A-Za-z_$][\w$]*/)?.[0];
      if (word) {
        const kind = keywords.has(word) ? "keyword" : builtinTypes.has(word) || /^[A-Z][A-Za-z0-9_$]*$/.test(word) ? "type" : "plain";
        push(tokens, word, kind);
        cursor += word.length;
        continue;
      }
      if (/[=+\-*/%<>!&|?:~]/.test(char)) push(tokens, char, "operator");
      else push(tokens, char, "plain");
      cursor += 1;
    }
    return tokens.length ? tokens : [{ text: "", kind: "plain" }];
  });
}
