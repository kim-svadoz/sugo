import type Parser from "web-tree-sitter";

export type OutlineKind = "class" | "interface" | "function" | "method";

export interface OutlineEntry {
  kind: OutlineKind;
  name: string;
  startLine: number;
  endLine: number;
}

export interface NodeTypeMapping {
  class?: string[];
  interface?: string[];
  method?: string[];
  function?: string[];
  import?: string[];
}

/** 언어별 tree-sitter 노드 타입 이름 — 문법마다 다르므로 언어별로 매핑해야 한다. */
export const NODE_TYPE_MAP: Record<string, NodeTypeMapping> = {
  typescript: {
    class: ["class_declaration"],
    interface: ["interface_declaration"],
    method: ["method_definition"],
    function: ["function_declaration"],
    import: ["import_statement"],
  },
  tsx: {
    class: ["class_declaration"],
    interface: ["interface_declaration"],
    method: ["method_definition"],
    function: ["function_declaration"],
    import: ["import_statement"],
  },
  javascript: {
    class: ["class_declaration"],
    method: ["method_definition"],
    function: ["function_declaration"],
    import: ["import_statement"],
  },
  python: {
    class: ["class_definition"],
    function: ["function_definition"],
    import: ["import_statement", "import_from_statement"],
  },
  java: {
    class: ["class_declaration"],
    interface: ["interface_declaration"],
    method: ["method_declaration"],
    import: ["import_declaration"],
  },
};

function makeEntry(kind: OutlineKind, node: Parser.SyntaxNode): OutlineEntry {
  const nameNode = node.childForFieldName("name");
  return {
    kind,
    name: nameNode?.text ?? "(anonymous)",
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
  };
}

/**
 * 순수 함수(파싱된 트리를 받아 구조만 추출, 파싱 자체는 astParser.ts의 IO 책임).
 * class 내부에서 발견된 function 노드(python처럼 method/function 노드타입이 같은 언어)는
 * method로 재분류한다 — insideClass로 재귀 중 추적.
 */
export function extractOutline(rootNode: Parser.SyntaxNode, language: string): { imports: string[]; entries: OutlineEntry[] } {
  const mapping = NODE_TYPE_MAP[language] ?? {};
  const entries: OutlineEntry[] = [];
  const imports: string[] = [];

  function walk(node: Parser.SyntaxNode, insideClass: boolean): void {
    if (mapping.import?.includes(node.type)) {
      imports.push(node.text.trim());
    } else if (mapping.class?.includes(node.type)) {
      entries.push(makeEntry("class", node));
    } else if (mapping.interface?.includes(node.type)) {
      entries.push(makeEntry("interface", node));
    } else if (mapping.method?.includes(node.type)) {
      entries.push(makeEntry("method", node));
    } else if (mapping.function?.includes(node.type)) {
      entries.push(makeEntry(insideClass ? "method" : "function", node));
    }

    const nextInsideClass = insideClass || !!mapping.class?.includes(node.type);
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, nextInsideClass);
    }
  }

  walk(rootNode, false);
  return { imports, entries };
}
