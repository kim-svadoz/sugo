/** 저장된 두 텍스트를 unified diff 본문으로 바꾼다. 메타 헤더는 뷰어가 사용하지 않는다. */
export function textDiff(before: string, after: string): string {
  const oldLines = before.replace(/\n$/, "").split("\n");
  const newLines = after.replace(/\n$/, "").split("\n");
  const rows = oldLines.length + 1;
  const cols = newLines.length + 1;
  if (rows * cols > 4_000_000) {
    return [...oldLines.map((line) => `-${line}`), ...newLines.map((line) => `+${line}`)].join("\n");
  }
  const lcs = Array.from({ length: rows }, () => new Uint32Array(cols));
  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      lcs[i][j] = oldLines[i] === newLines[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const output: string[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      output.push(` ${oldLines[i]}`); i++; j++;
    } else if (j < newLines.length && (i === oldLines.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      output.push(`+${newLines[j++]}`);
    } else {
      output.push(`-${oldLines[i++]}`);
    }
  }
  return output.join("\n");
}
