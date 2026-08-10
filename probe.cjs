const ts = require('typescript');
const fs = require('fs');
const file = 'src/pages/BillingDashboard.tsx';
const src = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function lineOf(pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function visit(node, depth) {
  if (ts.isFunctionDeclaration(node) && node.name) {
    console.log(node.name.text, 'starts line', lineOf(node.getStart()), 'ends line', lineOf(node.getEnd()));
  }
  ts.forEachChild(node, (c) => visit(c, depth+1));
}
visit(sf, 0);
