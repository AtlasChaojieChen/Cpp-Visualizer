// ===================== PUBLIC TYPES =====================

export interface ExecutionStep {
  line: number;
  nextLine?: number;
  callStack: StackFrameInfo[];
  globals?: VariableInfo[];
  output: string;
  heap: HeapBlockInfo[];
  arrayAccesses: ArrayAccessInfo[];
  activeCallColumns?: { startCol: number; endCol: number } | null;
}

export interface ArrayAccessInfo {
  arrayName: string;
  index: number;
  label: string; // e.g. "l", "r", "mid", "i"
}

export interface StackFrameInfo {
  name: string;
  args?: any[];
  variables: VariableInfo[];
  startLine: number;
  endLine: number;
  activeLine: number;
  activeCallColumns?: { startCol: number; endCol: number } | null;
  // Present ONLY on the step where this frame executes its `return`, and only
  // when it returns a value. Absent otherwise, so the key does not multiply
  // across every frame of every step. See docs/return-values-design.md.
  //
  // `returnType` rides along because a bare value carries no type: the integer
  // 104 and a pointer holding address 104 are indistinguishable, exactly as
  // they are in `args` (which recovers the type from `variables[i]` — a return
  // value has no such counterpart).
  returnValue?: any;
  returnType?: string;
}

export interface VariableInfo {
  name: string;
  type: string;
  value: any;
  address: number;
  isPointer: boolean;
  isArray: boolean;
  changed: boolean;
  pointsTo?: number;
}

export interface HeapBlockInfo {
  address: number;
  type: string;
  value: any;
  freed: boolean;
}

// ===================== TOKENIZER =====================

interface Token {
  type: 'number' | 'string' | 'char' | 'identifier' | 'keyword' | 'operator' | 'punctuation' | 'eof';
  value: string;
  line: number;
  col: number;
}

const KEYWORDS = new Set([
  'int', 'float', 'double', 'char', 'bool', 'void', 'string', 'vector', 'struct',
  'if', 'else', 'for', 'while', 'return', 'break', 'continue',
  'true', 'false', 'new', 'delete', 'cout', 'cin', 'endl', 'nullptr', 'const', 'NULL',
]);

const TYPE_KEYWORDS = new Set(['int', 'float', 'double', 'char', 'bool', 'void', 'string', 'const', 'vector']);

// Stream-setup boilerplate that competitive-programming code opens with. It is
// a no-op for an interpreter with no real iostreams, but `ios::sync_with_stdio`
// uses `::`, which is outside the supported subset, so it used to stop the
// parser on line one. Discarding the whole statement — trailing `;` or `,`
// included — is the same treatment `#` lines and `using` already get. The
// leading identifier is checked first so this only runs on a handful of tokens.
const STREAM_SETUP_HEADS = new Set(['ios', 'ios_base', 'std', 'cin', 'cout', 'cerr']);
const STREAM_SETUP_STMT =
  /^(?:std\s*::\s*)?(?:(?:ios|ios_base)\s*::\s*sync_with_stdio|c(?:in|out|err)\s*\.\s*tie)\s*\([^)]*\)\s*[;,]?/;

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0, line = 1, col = 1;

  while (i < code.length) {
    if (code[i] === '\n') { line++; col = 1; i++; continue; }
    if (/\s/.test(code[i])) { col++; i++; continue; }
    if (code[i] === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
    if (code[i] === '/' && code[i + 1] === '*') {
      i += 2; col += 2;
      while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] === '\n') { line++; col = 1; } else col++; i++; }
      i += 2; col += 2; continue;
    }
    if (code[i] === '#') { while (i < code.length && code[i] !== '\n') i++; continue; }

    if (/\d/.test(code[i])) {
      let num = ''; const startCol = col;
      // Hex and binary bases: bitwise code is written with masks like `0xff`,
      // and without this `0xff` lexes as the number 0 followed by `xff`.
      const base = code[i] === '0' ? code[i + 1] : '';
      const digits = base === 'x' || base === 'X' ? /[0-9a-fA-F]/ : base === 'b' || base === 'B' ? /[01]/ : null;
      if (digits) {
        num = code.substring(i, i + 2); i += 2; col += 2;
        while (i < code.length && digits.test(code[i])) { num += code[i++]; col++; }
      } else {
        while (i < code.length && /[\d.]/.test(code[i])) { num += code[i++]; col++; }
      }
      tokens.push({ type: 'number', value: num, line, col: startCol }); continue;
    }

    if (/[a-zA-Z_]/.test(code[i])) {
      let id = ''; const startCol = col, startIdx = i;
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) { id += code[i++]; col++; }
      if (id === 'using') { while (i < code.length && code[i] !== ';') { if (code[i] === '\n') { line++; col = 1; } else col++; i++; } i++; col++; continue; }
      if (STREAM_SETUP_HEADS.has(id)) {
        // Anchored at the identifier, so a `cout` in `cout << "cin.tie(0);"`
        // cannot match — string literals are consumed before we ever get here.
        const m = STREAM_SETUP_STMT.exec(code.substring(startIdx, startIdx + 120));
        if (m) { i = startIdx + m[0].length; col = startCol + m[0].length; continue; }
      }
      tokens.push({ type: KEYWORDS.has(id) ? 'keyword' : 'identifier', value: id, line, col: startCol }); continue;
    }

    if (code[i] === '"') {
      let str = ''; const startCol = col; i++; col++;
      while (i < code.length && code[i] !== '"') {
        if (code[i] === '\\') { i++; col++; str += code[i] === 'n' ? '\n' : code[i] === 't' ? '\t' : code[i]; }
        else str += code[i];
        i++; col++;
      }
      i++; col++;
      tokens.push({ type: 'string', value: str, line, col: startCol }); continue;
    }

    if (code[i] === "'") {
      const startCol = col;
      i++; col++;
      let ch = code[i];
      if (ch === '\\') { i++; col++; ch = code[i] === 'n' ? '\n' : code[i] === 't' ? '\t' : code[i]; }
      i += 2; col += 2;
      tokens.push({ type: 'char', value: ch, line, col: startCol }); continue;
    }

    // Check for -> operator
    if (code[i] === '-' && code[i + 1] === '>') {
      tokens.push({ type: 'operator', value: '->', line, col }); i += 2; col += 2; continue;
    }

    // Longest match first: `<<=` must not lex as `<<` followed by `=`.
    const three = code.substring(i, i + 3);
    if (three === '<<=' || three === '>>=') {
      tokens.push({ type: 'operator', value: three, line, col }); i += 3; col += 3; continue;
    }

    const two = code.substring(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '<<', '>>', '&=', '|=', '^='].includes(two)) {
      tokens.push({ type: 'operator', value: two, line, col }); i += 2; col += 2; continue;
    }

    if ('+-*/%=<>!&|^~'.includes(code[i])) {
      tokens.push({ type: 'operator', value: code[i], line, col }); i++; col++; continue;
    }

    if ('(){}[];,.'.includes(code[i])) {
      tokens.push({ type: 'punctuation', value: code[i], line, col }); i++; col++; continue;
    }

    i++; col++;
  }

  tokens.push({ type: 'eof', value: '', line, col });
  return tokens;
}

// ===================== PARSER =====================

interface ASTNode {
  type: string;
  line: number;
  col?: number;
  endCol?: number;
  [key: string]: any;
}

class Parser {
  private tokens: Token[];
  private pos = 0;
  // Track user-defined struct names so they can be used as types
  private structNames = new Set<string>();

  constructor(tokens: Token[]) { this.tokens = tokens; }

  private peek(): Token { return this.tokens[this.pos]; }
  private advance(): Token { return this.tokens[this.pos++]; }

  private expect(type: string, value?: string): Token {
    const t = this.advance();
    if (t.type !== type || (value !== undefined && t.value !== value))
      throw new Error(`Expected '${value || type}' at line ${t.line}, got '${t.value}'`);
    return t;
  }

  private match(type: string, value?: string): boolean {
    const t = this.peek();
    if (t.type === type && (value === undefined || t.value === value)) { this.pos++; return true; }
    return false;
  }

  private isType(): boolean {
    return TYPE_KEYWORDS.has(this.peek().value) || this.structNames.has(this.peek().value);
  }

  parse(): ASTNode {
    // Pre-scan for struct names
    for (let i = 0; i < this.tokens.length; i++) {
      if (this.tokens[i].value === 'struct' && this.tokens[i + 1]?.type === 'identifier') {
        this.structNames.add(this.tokens[i + 1].value);
      }
    }
    const body: ASTNode[] = [];
    while (this.peek().type !== 'eof') body.push(this.parseTopLevel());
    return { type: 'Program', body, line: 1 };
  }

  private parseTopLevel(): ASTNode {
    // Handle struct declarations
    if (this.peek().type === 'keyword' && this.peek().value === 'struct') {
      return this.parseStructDecl();
    }
    const line = this.peek().line;
    let typeName = this.advance().value;
    if (typeName === 'const') typeName += ' ' + this.advance().value;
    let isPointer = false;
    if (this.peek().type === 'operator' && this.peek().value === '*') { this.advance(); isPointer = true; }
    const name = this.expect('identifier').value;
    if (this.peek().type === 'punctuation' && this.peek().value === '(')
      return this.parseFunctionDecl(typeName, name, isPointer, line);
    return this.parseVarDeclRest(typeName, name, isPointer, line);
  }

  private parseStructDecl(): ASTNode {
    const line = this.advance().line; // consume 'struct'
    const name = this.expect('identifier').value;
    this.structNames.add(name);
    this.expect('punctuation', '{');
    const members: { type: string; name: string; isPointer: boolean }[] = [];
    while (!(this.peek().type === 'punctuation' && this.peek().value === '}')) {
      let mType = this.advance().value;
      let mIsPointer = false;
      if (this.peek().type === 'operator' && this.peek().value === '*') { this.advance(); mIsPointer = true; }
      const mName = this.expect('identifier').value;
      this.expect('punctuation', ';');
      members.push({ type: mType + (mIsPointer ? '*' : ''), name: mName, isPointer: mIsPointer });
    }
    this.expect('punctuation', '}');
    this.expect('punctuation', ';');
    return { type: 'StructDecl', name, members, line };
  }

  private parseFunctionDecl(returnType: string, name: string, _isPointer: boolean, line: number): ASTNode {
    this.expect('punctuation', '(');
    const params: any[] = [];
    while (!(this.peek().type === 'punctuation' && this.peek().value === ')')) {
      let pType = this.advance().value;
      let pIsPointer = false, pIsRef = false;
      if (this.peek().type === 'operator' && this.peek().value === '*') { this.advance(); pIsPointer = true; }
      if (this.peek().type === 'operator' && this.peek().value === '&') { this.advance(); pIsRef = true; }
      const pName = this.expect('identifier').value;
      params.push({ type: pType, name: pName, isPointer: pIsPointer, isRef: pIsRef });
      if (this.peek().type === 'punctuation' && this.peek().value === ',') this.advance();
    }
    this.expect('punctuation', ')');
    const body = this.parseBlock();
    return { type: 'FunctionDecl', returnType, name, params, body, line };
  }

  private parseBlock(): ASTNode {
    const line = this.peek().line;
    this.expect('punctuation', '{');
    const body: ASTNode[] = [];
    while (!(this.peek().type === 'punctuation' && this.peek().value === '}'))
      body.push(this.parseStatement());
    this.expect('punctuation', '}');
    return { type: 'Block', body, line };
  }

  private parseStatement(): ASTNode {
    const p = this.peek();
    if (p.type === 'punctuation' && p.value === '{') return this.parseBlock();
    if (p.type === 'keyword') {
      switch (p.value) {
        case 'if': return this.parseIf();
        case 'for': return this.parseFor();
        case 'while': return this.parseWhile();
        case 'return': return this.parseReturn();
        case 'cout': return this.parseCout();
        case 'cin': return this.parseCin();
        case 'delete': return this.parseDelete();
        case 'break': this.advance(); this.expect('punctuation', ';'); return { type: 'Break', line: p.line };
        case 'continue': this.advance(); this.expect('punctuation', ';'); return { type: 'Continue', line: p.line };
      }
    }
    if (this.isType()) return this.parseVarDecl();
    return this.parseExprStmt();
  }

  private parseVarDecl(): ASTNode {
    const line = this.peek().line;
    let typeName = this.advance().value;
    if (typeName === 'const') typeName += ' ' + this.advance().value;
    // Handle vector<type>
    if (typeName === 'vector') {
      this.expect('operator', '<');
      const innerType = this.advance().value;
      this.expect('operator', '>');
      const name = this.expect('identifier').value;
      let arrayInit: ASTNode[] | null = null;
      if (this.match('operator', '=')) {
        this.expect('punctuation', '{');
        arrayInit = [];
        while (!(this.peek().type === 'punctuation' && this.peek().value === '}')) {
          arrayInit.push(this.parseExpr());
          if (this.peek().type === 'punctuation' && this.peek().value === ',') this.advance();
        }
        this.expect('punctuation', '}');
      } else if (this.peek().type === 'punctuation' && this.peek().value === '(') {
        this.advance();
        const sizeExpr = this.parseExpr();
        let valExpr: ASTNode | null = null;
        if (this.peek().type === 'punctuation' && this.peek().value === ',') {
          this.advance();
          valExpr = this.parseExpr();
        }
        this.expect('punctuation', ')');
        this.expect('punctuation', ';');
        return { type: 'VarDecl', varType: `vector<${innerType}>`, name, isPointer: false, isArray: true, isVector: true, vectorSize: sizeExpr, vectorFill: valExpr, arrayInit: null, arraySize: null, line };
      }
      this.expect('punctuation', ';');
      return { type: 'VarDecl', varType: `vector<${innerType}>`, name, isPointer: false, isArray: true, isVector: true, arrayInit, arraySize: null, vectorSize: null, vectorFill: null, line };
    }
    let isPointer = false;
    if (this.peek().type === 'operator' && this.peek().value === '*') { this.advance(); isPointer = true; }
    const name = this.expect('identifier').value;
    return this.parseVarDeclRest(typeName, name, isPointer, line);
  }

  private parseVarDeclRest(typeName: string, name: string, isPointer: boolean, line: number): ASTNode {
    if (this.peek().type === 'punctuation' && this.peek().value === '[') {
      this.advance();
      let size: ASTNode | null = null;
      if (!(this.peek().type === 'punctuation' && this.peek().value === ']')) size = this.parseExpr();
      this.expect('punctuation', ']');
      let arrayInit: ASTNode[] | null = null;
      if (this.match('operator', '=')) {
        this.expect('punctuation', '{');
        arrayInit = [];
        while (!(this.peek().type === 'punctuation' && this.peek().value === '}')) {
          arrayInit.push(this.parseExpr());
          if (this.peek().type === 'punctuation' && this.peek().value === ',') this.advance();
        }
        this.expect('punctuation', '}');
      }
      this.expect('punctuation', ';');
      return { type: 'VarDecl', varType: typeName, name, isPointer: false, isArray: true, arraySize: size, arrayInit, line };
    }
    let init: ASTNode | null = null;
    if (this.match('operator', '=')) init = this.parseExpr();
    // Support multi-variable declarations: int a = 0, b = 1;
    if (this.peek().type === 'punctuation' && this.peek().value === ',') {
      const decls: ASTNode[] = [{ type: 'VarDecl', varType: typeName, name, isPointer, isArray: false, init, line }];
      while (this.peek().type === 'punctuation' && this.peek().value === ',') {
        this.advance(); // consume ','
        let nextIsPointer = false;
        if (this.peek().type === 'operator' && this.peek().value === '*') { this.advance(); nextIsPointer = true; }
        const nextName = this.expect('identifier').value;
        let nextInit: ASTNode | null = null;
        if (this.match('operator', '=')) nextInit = this.parseExpr();
        decls.push({ type: 'VarDecl', varType: typeName, name: nextName, isPointer: nextIsPointer, isArray: false, init: nextInit, line });
      }
      this.expect('punctuation', ';');
      return { type: 'MultiVarDecl', declarations: decls, line };
    }
    this.expect('punctuation', ';');
    return { type: 'VarDecl', varType: typeName, name, isPointer, isArray: false, init, line };
  }

  private parseIf(): ASTNode {
    const line = this.advance().line;
    this.expect('punctuation', '(');
    const condition = this.parseExpr();
    this.expect('punctuation', ')');
    const then = this.parseStatement();
    let elseBody: ASTNode | null = null;
    if (this.peek().type === 'keyword' && this.peek().value === 'else') { this.advance(); elseBody = this.parseStatement(); }
    return { type: 'If', condition, then, elseBody, line };
  }

  private parseFor(): ASTNode {
    const line = this.advance().line;
    this.expect('punctuation', '(');
    let init: ASTNode | null = null;
    if (this.isType()) init = this.parseVarDecl();
    else if (!(this.peek().type === 'punctuation' && this.peek().value === ';')) init = this.parseExprStmt();
    else this.advance();
    let condition: ASTNode | null = null;
    if (!(this.peek().type === 'punctuation' && this.peek().value === ';')) condition = this.parseExpr();
    this.expect('punctuation', ';');
    let update: ASTNode | null = null;
    if (!(this.peek().type === 'punctuation' && this.peek().value === ')')) update = this.parseExpr();
    this.expect('punctuation', ')');
    const body = this.parseStatement();
    return { type: 'For', init, condition, update, body, line };
  }

  private parseWhile(): ASTNode {
    const line = this.advance().line;
    this.expect('punctuation', '(');
    const condition = this.parseExpr();
    this.expect('punctuation', ')');
    return { type: 'While', condition, body: this.parseStatement(), line };
  }

  private parseReturn(): ASTNode {
    const line = this.advance().line;
    let value: ASTNode | null = null;
    if (!(this.peek().type === 'punctuation' && this.peek().value === ';')) value = this.parseExpr();
    this.expect('punctuation', ';');
    return { type: 'Return', value, line };
  }

  private parseCout(): ASTNode {
    const line = this.advance().line;
    const expressions: ASTNode[] = [];
    while (this.peek().type === 'operator' && this.peek().value === '<<') {
      this.advance();
      if (this.peek().type === 'keyword' && this.peek().value === 'endl') {
        this.advance();
        expressions.push({ type: 'StringLit', value: '\n', line });
      } else {
        expressions.push(this.parseAddition());
      }
    }
    this.expect('punctuation', ';');
    return { type: 'Cout', expressions, line };
  }

  private parseCin(): ASTNode {
    const line = this.advance().line;
    const targets: ASTNode[] = [];
    while (this.peek().type === 'operator' && this.peek().value === '>>') {
      this.advance();
      targets.push(this.parseAddition());
    }
    this.expect('punctuation', ';');
    return { type: 'Cin', targets, line };
  }

  private parseDelete(): ASTNode {
    const line = this.advance().line;
    let isArray = false;
    if (this.peek().type === 'punctuation' && this.peek().value === '[') { this.advance(); this.expect('punctuation', ']'); isArray = true; }
    const expr = this.parseExpr();
    this.expect('punctuation', ';');
    return { type: 'Delete', expr, isArray, line };
  }

  private parseExprStmt(): ASTNode {
    const line = this.peek().line;
    const expr = this.parseExpr();
    this.expect('punctuation', ';');
    return { type: 'ExprStmt', expr, line };
  }

  private parseExpr(): ASTNode { return this.parseAssignment(); }

  private parseAssignment(): ASTNode {
    let left = this.parseLogicalOr();
    const p = this.peek();
    if (p.type === 'operator' && p.value === '=') {
      this.advance();
      return { type: 'Assign', target: left, value: this.parseAssignment(), line: p.line };
    }
    if (p.type === 'operator' && ['+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='].includes(p.value)) {
      const op = this.advance().value;
      return { type: 'CompoundAssign', operator: op, target: left, value: this.parseAssignment(), line: p.line };
    }
    return left;
  }

  private parseLogicalOr(): ASTNode {
    let left = this.parseLogicalAnd();
    while (this.peek().type === 'operator' && this.peek().value === '||') {
      const line = this.advance().line;
      left = { type: 'Binary', operator: '||', left, right: this.parseLogicalAnd(), line };
    }
    return left;
  }

  private parseLogicalAnd(): ASTNode {
    let left = this.parseBitOr();
    while (this.peek().type === 'operator' && this.peek().value === '&&') {
      const line = this.advance().line;
      left = { type: 'Binary', operator: '&&', left, right: this.parseBitOr(), line };
    }
    return left;
  }

  // C++ slots the three bitwise levels between `&&` and `==`, loosest first:
  // `|` then `^` then `&`. This is why `a & 1 == 0` means `a & (1 == 0)` and
  // needs parentheses to do what it looks like it does.
  private parseBitOr(): ASTNode {
    let left = this.parseBitXor();
    while (this.peek().type === 'operator' && this.peek().value === '|') {
      const line = this.advance().line;
      left = { type: 'Binary', operator: '|', left, right: this.parseBitXor(), line };
    }
    return left;
  }

  private parseBitXor(): ASTNode {
    let left = this.parseBitAnd();
    while (this.peek().type === 'operator' && this.peek().value === '^') {
      const line = this.advance().line;
      left = { type: 'Binary', operator: '^', left, right: this.parseBitAnd(), line };
    }
    return left;
  }

  private parseBitAnd(): ASTNode {
    let left = this.parseEquality();
    while (this.peek().type === 'operator' && this.peek().value === '&') {
      const line = this.advance().line;
      left = { type: 'Binary', operator: '&', left, right: this.parseEquality(), line };
    }
    return left;
  }

  private parseEquality(): ASTNode {
    let left = this.parseComparison();
    while (this.peek().type === 'operator' && ['==', '!='].includes(this.peek().value)) {
      const op = this.advance();
      left = { type: 'Binary', operator: op.value, left, right: this.parseComparison(), line: op.line };
    }
    return left;
  }

  private parseComparison(): ASTNode {
    let left = this.parseShift();
    while (this.peek().type === 'operator' && ['<', '>', '<=', '>='].includes(this.peek().value)) {
      const op = this.advance();
      left = { type: 'Binary', operator: op.value, left, right: this.parseShift(), line: op.line };
    }
    return left;
  }

  // Shifts sit between comparison and addition, which is exactly what keeps
  // `cout << a << b` working: parseCout reads each operand at ADDITION
  // precedence, so a `<<` between two operands is always the stream's, never a
  // shift. `cout << (a << 2)` needs its parentheses here for the same reason it
  // does in real C++.
  private parseShift(): ASTNode {
    let left = this.parseAddition();
    while (this.peek().type === 'operator' && ['<<', '>>'].includes(this.peek().value)) {
      const op = this.advance();
      left = { type: 'Binary', operator: op.value, left, right: this.parseAddition(), line: op.line };
    }
    return left;
  }

  private parseAddition(): ASTNode {
    let left = this.parseMultiplication();
    while (this.peek().type === 'operator' && ['+', '-'].includes(this.peek().value)) {
      const op = this.advance();
      left = { type: 'Binary', operator: op.value, left, right: this.parseMultiplication(), line: op.line };
    }
    return left;
  }

  private parseMultiplication(): ASTNode {
    let left = this.parseUnary();
    while (this.peek().type === 'operator' && ['*', '/', '%'].includes(this.peek().value)) {
      const op = this.advance();
      left = { type: 'Binary', operator: op.value, left, right: this.parseUnary(), line: op.line };
    }
    return left;
  }

  private parseUnary(): ASTNode {
    const p = this.peek();
    if (p.type === 'operator') {
      if (p.value === '!') { this.advance(); return { type: 'Unary', operator: '!', operand: this.parseUnary(), line: p.line }; }
      if (p.value === '-') { this.advance(); return { type: 'Unary', operator: '-', operand: this.parseUnary(), line: p.line }; }
      if (p.value === '~') { this.advance(); return { type: 'Unary', operator: '~', operand: this.parseUnary(), line: p.line }; }
      if (p.value === '*') { this.advance(); return { type: 'Deref', operand: this.parseUnary(), line: p.line }; }
      if (p.value === '&') { this.advance(); return { type: 'AddressOf', operand: this.parseUnary(), line: p.line }; }
      if (p.value === '++') { this.advance(); return { type: 'PrefixInc', operand: this.parseUnary(), line: p.line }; }
      if (p.value === '--') { this.advance(); return { type: 'PrefixDec', operand: this.parseUnary(), line: p.line }; }
    }
    return this.parsePostfix();
  }

  private parsePostfix(): ASTNode {
    let expr = this.parsePrimary();
    while (true) {
      if (this.peek().type === 'punctuation' && this.peek().value === '[') {
        this.advance();
        const index = this.parseExpr();
        this.expect('punctuation', ']');
        expr = { type: 'ArrayAccess', array: expr, index, line: expr.line };
      } else if (this.peek().type === 'punctuation' && this.peek().value === '(') {
        const callStartCol = expr.col || 1;
        this.advance();
        const args: ASTNode[] = [];
        while (!(this.peek().type === 'punctuation' && this.peek().value === ')')) {
          args.push(this.parseExpr());
          if (this.peek().type === 'punctuation' && this.peek().value === ',') this.advance();
        }
        const closeParen = this.expect('punctuation', ')');
        const callEndCol = closeParen.col + 1;
        expr = { type: 'Call', callee: expr, args, line: expr.line, col: callStartCol, endCol: callEndCol };
      } else if (this.peek().type === 'operator' && this.peek().value === '++') {
        this.advance(); expr = { type: 'PostfixInc', operand: expr, line: expr.line };
      } else if (this.peek().type === 'operator' && this.peek().value === '--') {
        this.advance(); expr = { type: 'PostfixDec', operand: expr, line: expr.line };
      } else if (this.peek().type === 'punctuation' && this.peek().value === '.') {
        this.advance();
        expr = { type: 'MemberAccess', object: expr, member: this.expect('identifier').value, line: expr.line };
      } else if (this.peek().type === 'operator' && this.peek().value === '->') {
        this.advance();
        expr = { type: 'ArrowAccess', object: expr, member: this.expect('identifier').value, line: expr.line };
      } else break;
    }
    return expr;
  }

  private parsePrimary(): ASTNode {
    const p = this.peek();
    // `isFloat` comes from the LEXEME, not the value: `Number('7.0')` is 7, so
    // by the time the interpreter sees it a double literal is indistinguishable
    // from an int one. This is the single bit that made `7.0 / 2` truncate.
    if (p.type === 'number') { this.advance(); return { type: 'NumberLit', value: Number(p.value), isFloat: p.value.includes('.'), line: p.line }; }
    if (p.type === 'string') { this.advance(); return { type: 'StringLit', value: p.value, line: p.line }; }
    if (p.type === 'char') { this.advance(); return { type: 'CharLit', value: p.value, line: p.line }; }
    if (p.type === 'keyword' && p.value === 'true') { this.advance(); return { type: 'BoolLit', value: true, line: p.line }; }
    if (p.type === 'keyword' && p.value === 'false') { this.advance(); return { type: 'BoolLit', value: false, line: p.line }; }
    if (p.type === 'keyword' && (p.value === 'nullptr' || p.value === 'NULL')) { this.advance(); return { type: 'Nullptr', line: p.line }; }
    if (p.type === 'keyword' && p.value === 'new') {
      this.advance();
      const newType = this.advance().value;
      // new StructName(args...) or new StructName{args...}
      if (this.peek().type === 'punctuation' && this.peek().value === '(') {
        this.advance();
        const initArgs: ASTNode[] = [];
        while (!(this.peek().type === 'punctuation' && this.peek().value === ')')) {
          initArgs.push(this.parseExpr());
          if (this.peek().type === 'punctuation' && this.peek().value === ',') this.advance();
        }
        this.expect('punctuation', ')');
        if (initArgs.length <= 1) {
          return { type: 'New', newType, isArray: false, initValue: initArgs[0] || null, initArgs: initArgs.length > 1 ? initArgs : null, line: p.line };
        }
        return { type: 'New', newType, isArray: false, initValue: null, initArgs, line: p.line };
      }
      if (this.peek().type === 'punctuation' && this.peek().value === '{') {
        this.advance();
        const initArgs: ASTNode[] = [];
        while (!(this.peek().type === 'punctuation' && this.peek().value === '}')) {
          initArgs.push(this.parseExpr());
          if (this.peek().type === 'punctuation' && this.peek().value === ',') this.advance();
        }
        this.expect('punctuation', '}');
        return { type: 'New', newType, isArray: false, initValue: null, initArgs, line: p.line };
      }
      if (this.peek().type === 'punctuation' && this.peek().value === '[') {
        this.advance();
        const size = this.parseExpr();
        this.expect('punctuation', ']');
        return { type: 'New', newType, isArray: true, size, line: p.line };
      }
      return { type: 'New', newType, isArray: false, initValue: null, line: p.line };
    }
    if (p.type === 'identifier') { this.advance(); return { type: 'Identifier', name: p.value, line: p.line }; }
    if (p.type === 'punctuation' && p.value === '(') {
      // Check for C-style cast: (int)expr, (double)expr, etc.
      const saved = this.pos;
      this.advance(); // consume '('
      if ((this.peek().type === 'keyword' && TYPE_KEYWORDS.has(this.peek().value)) || this.structNames.has(this.peek().value)) {
        const castType = this.advance().value;
        if (this.peek().type === 'punctuation' && this.peek().value === ')') {
          this.advance(); // consume ')'
          const operand = this.parseUnary();
          return { type: 'Cast', castType, operand, line: p.line };
        }
        // Not a cast, backtrack
        this.pos = saved;
        this.advance();
      }
      const expr = this.parseExpr();
      this.expect('punctuation', ')');
      return expr;
    }
    throw new Error(`Unexpected token '${p.value}' at line ${p.line}`);
  }
}

// ===================== INTERPRETER =====================

// Assigning a char into one of these yields its ASCII code, per C++ promotion.
const NUMERIC_TYPES = new Set(['int', 'short', 'long', 'float', 'double']);

// `/` truncates when the expression's static type is integral. `char` and
// `bool` promote to int in arithmetic, so they count.
const INTEGRAL_TYPES = new Set(['int', 'short', 'long', 'char', 'bool']);
const COMPARISON_OPS = new Set(['==', '!=', '<', '>', '<=', '>=', '&&', '||']);

// Bitwise operators take integral operands and, after promotion, always yield
// an `int` — even for `char & char`.
const BITWISE_OPS = new Set(['&', '|', '^', '<<', '>>']);

class ReturnSignal { constructor(public value: any) {} }
class BreakSignal {}
class ContinueSignal {}

// A reference parameter does not own a value; it aliases a storage slot that
// lives in the caller. `obj[key]` IS that slot: for a plain variable it is the
// caller's VarEntry with key 'value'; for an array element it is the live
// array with a numeric index; for a struct field it is the struct object with
// the field name. All three are mutated in place, so a write through the
// reference is visible to the caller, and every snapshot reads through to the
// current value without changing the record-everything-up-front model.
interface RefBinding {
  obj: any;
  key: string | number;
  address: number;
}

interface VarEntry {
  type: string;
  value: any;
  address: number;
  isPointer: boolean;
  isArray: boolean;
  ref?: RefBinding;
}

interface Frame {
  name: string;
  args?: any[];
  vars: Map<string, VarEntry>;
  startLine: number;
  endLine: number;
  activeLine: number;
  activeCallColumns: { startCol: number; endCol: number } | null;
  // Set immediately before the return step is recorded; the frame is popped
  // right after, so it can never go stale and needs no clearing.
  returnValue?: any;
  returnType?: string;
}

interface HeapEntry {
  type: string;
  value: any;
  freed: boolean;
}

class Interpreter {
  private functions = new Map<string, ASTNode>();
  private structs = new Map<string, { name: string; members: { type: string; name: string; isPointer: boolean }[] }>();
  private callStack: Frame[] = [];
  private globalVars = new Map<string, VarEntry>();
  private heap = new Map<number, HeapEntry>();
  private nextAddr = 100;
  private output = '';
  private steps: ExecutionStep[] = [];
  private maxSteps = 10000;
  // Guards runaway recursion. `maxSteps` already stops most of it, but a
  // function that recurses without recording a step (or that blows the real JS
  // stack first) used to leak "Maximum call stack size exceeded" and produce a
  // nondeterministic step count. 200 frames is far above anything the visualizer
  // can usefully display — the deepest program in the corpus reaches 16.
  private maxCallDepth = 200;
  private stdinBuffer: string[] = [];
  private stdinPos = 0;
  private currentArrayAccesses: ArrayAccessInfo[] = [];

  run(program: ASTNode, stdin = ''): { steps: ExecutionStep[]; error?: string } {
    this.stdinBuffer = stdin.split(/\s+/).filter(s => s.length > 0);
    try {
      for (const node of program.body) {
        if (node.type === 'FunctionDecl') this.functions.set(node.name, node);
        if (node.type === 'StructDecl') this.structs.set(node.name, { name: node.name, members: node.members });
      }
      // Initialize global variables before main() runs
      for (const node of program.body) {
        if (node.type === 'VarDecl') this.initGlobalVar(node);
        if (node.type === 'MultiVarDecl') for (const decl of node.declarations) this.initGlobalVar(decl);
      }
      if (!this.functions.has('main')) throw new Error('No main() function found');
      this.callFunction('main', []);
      return { steps: this.steps };
    } catch (e: any) {
      if (e instanceof ReturnSignal) return { steps: this.steps };
      return { steps: this.steps, error: e.message };
    }
  }

  private initGlobalVar(stmt: ASTNode): void {
    if (stmt.isArray) {
      let values: any[];
      if (stmt.arrayInit) {
        values = stmt.arrayInit.map((e: ASTNode) => { try { return this.evalExpr(e); } catch { return 0; } });
        values = this.padToDeclaredSize(values, stmt);
      } else {
        const sz = stmt.arraySize ? (() => { try { return this.evalExpr(stmt.arraySize); } catch { return 0; } })() : 0;
        values = new Array(sz).fill(0);
      }
      const et = this.ElementType(stmt.varType);
      this.globalVars.set(stmt.name, { type: stmt.varType, value: values.map(v => this.CoerceToDeclared(et, v)), address: this.allocAddr(), isPointer: false, isArray: true });
    } else {
      let value: any = 0;
      if (stmt.init) { try { value = this.evalExpr(stmt.init); } catch { value = 0; } }
      else if (stmt.varType === 'string') value = '';
      else if (stmt.varType === 'bool') value = false;
      else if (stmt.varType === 'char') value = '\0';
      else if (!stmt.isPointer && this.structs.has(stmt.varType)) {
        const sd = this.structs.get(stmt.varType)!;
        const obj: Record<string, any> = {};
        for (const m of sd.members) obj[m.name] = 0;
        value = obj;
      }
      const gType = stmt.varType + (stmt.isPointer ? '*' : '');
      this.globalVars.set(stmt.name, { type: gType, value: stmt.isPointer ? value : this.CoerceToDeclared(gType, value), address: this.allocAddr(), isPointer: stmt.isPointer || false, isArray: false });
    }
  }

  private allocAddr(): number { const a = this.nextAddr; this.nextAddr += 4; return a; }

  // A brace initialiser may be shorter than the declared size; C++ value-
  // initialises the remainder. Vectors have no declared size to honour.
  private padToDeclaredSize(values: any[], stmt: ASTNode): any[] {
    if (stmt.isVector || !stmt.arraySize) return values;
    let size: number;
    try { size = this.evalExpr(stmt.arraySize); } catch { return values; }
    if (typeof size !== 'number' || size <= values.length) return values;
    const fill = stmt.varType === 'string' ? '' : stmt.varType === 'char' ? '\0' : stmt.varType === 'bool' ? false : 0;
    return values.concat(new Array(size - values.length).fill(fill));
  }

  private getLastLine(node: ASTNode): number {
    let max = node.line;
    if (node.body && Array.isArray(node.body)) {
      for (const child of node.body) max = Math.max(max, this.getLastLine(child));
    }
    if (node.then) max = Math.max(max, this.getLastLine(node.then));
    if (node.elseBody) max = Math.max(max, this.getLastLine(node.elseBody));
    if (node.body && !Array.isArray(node.body)) max = Math.max(max, this.getLastLine(node.body));
    return max;
  }

  private currentFrame(): Frame { return this.callStack[this.callStack.length - 1]; }

  private lookupVar(name: string): VarEntry | undefined {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      const v = this.callStack[i].vars.get(name);
      if (v) return v;
    }
    return this.globalVars.get(name);
  }

  // ---- char handling -------------------------------------------------------
  //
  // A char is still stored as a one-character JS string, exactly as before, so
  // the snapshot format, `cout`, `cin` and equality are all untouched. Two
  // narrow additions make `c + 1` mean 98 without inventing a type system:
  //
  //   1. `IsCharExpr` reads the DECLARED type of an expression. It is a lookup,
  //      not an inferencer: it answers only for literals, casts, variables,
  //      array elements, struct members and calls — i.e. places where a type was
  //      written down and is already stored (VarEntry.type, param.type, struct
  //      member type, FunctionDecl.returnType). Everything else returns null and
  //      falls back to today's runtime behaviour.
  //   2. `CoerceToDeclared` converts at declaration/assignment boundaries, which
  //      is exactly what C++ does: `c + 1` is an int, and `char d = <int>` narrows
  //      it back to a character.
  //
  // Crucially this does NOT thread static types through evalExpr — evalExpr's
  // inputs and return values are unchanged — so it leaves the `/`-truncation
  // design question untouched. It also never guesses that a one-character string
  // is a char: `string s = "a"; s + "b"` sees a declared `string` and concatenates.
  private BaseType(type: string): string {
    let t = type;
    if (t.startsWith('const ')) t = t.slice(6);
    if (t.endsWith('&')) t = t.slice(0, -1);
    return t;
  }

  private ElementType(varType: string): string {
    const m = /^vector<(.+)>$/.exec(this.BaseType(varType));
    return m ? m[1] : varType;
  }

  private MemberTypeOf(objExpr: ASTNode, member: string): string | null {
    if (objExpr.type !== 'Identifier') return null;
    const v = this.lookupVar(objExpr.name);
    if (!v) return null;
    const sd = this.structs.get(this.BaseType(v.type).replace(/\*+$/, ''));
    return sd?.members.find(m => m.name === member)?.type ?? null;
  }

  // The declared type of an expression, or null when it was never written down.
  private DeclaredTypeOf(expr: ASTNode): string | null {
    switch (expr.type) {
      case 'CharLit': return 'char';
      case 'StringLit': return 'string';
      case 'Cast': return expr.castType;
      case 'Identifier': {
        const v = this.lookupVar(expr.name);
        return v ? this.BaseType(v.type) : null;
      }
      case 'ArrayAccess': {
        if (expr.array.type !== 'Identifier') return null;
        const v = this.lookupVar(expr.array.name);
        return v && v.isArray ? this.ElementType(v.type) : null;
      }
      case 'MemberAccess': return this.MemberTypeOf(expr.object, expr.member);
      case 'ArrowAccess': return this.MemberTypeOf(expr.object, expr.member);
      case 'Call':
        return expr.callee.type === 'Identifier'
          ? this.functions.get(expr.callee.name)?.returnType ?? null
          : null;
      default: return null;
    }
  }

  private IsCharExpr(expr: ASTNode): boolean {
    return this.DeclaredTypeOf(expr) === 'char'; // exact: 'char*' is a pointer, not a char
  }

  // ---- static types (Stage 5) ----------------------------------------------
  //
  // `DeclaredTypeOf` answers only for expressions whose type was WRITTEN DOWN.
  // `StaticTypeOf` extends it to composite expressions, which is what `/` needs:
  // whether a division truncates depends on the operands' types, and `7.0` and
  // `7` are the same JS number by the time `/` sees them. No value
  // representation changes — this is a read-only walk over the AST, so the
  // snapshot format and every UI panel are untouched.
  //
  // `null` means "not written down anywhere", and every caller falls back to
  // the previous runtime behaviour rather than guessing.

  // Only the integral/floating distinction matters here, so all integral types
  // collapse to 'int'. A known floating operand is decisive even when the other
  // side is unknown, because in C++ it always makes the result floating.
  private ArithResultType(l: string | null, r: string | null): string | null {
    const Floating = (t: string | null) => t === 'double' || t === 'float';
    if (Floating(l) || Floating(r)) return 'double';
    if (l === 'string' || r === 'string') return 'string';
    if (l === null || r === null) return null;
    return 'int';
  }

  private StaticTypeOf(expr: ASTNode): string | null {
    switch (expr.type) {
      case 'NumberLit': return expr.isFloat ? 'double' : 'int';
      case 'BoolLit': return 'bool';
      case 'Binary': {
        if (COMPARISON_OPS.has(expr.operator)) return 'bool';
        if (BITWISE_OPS.has(expr.operator)) return 'int';
        return this.ArithResultType(this.StaticTypeOf(expr.left), this.StaticTypeOf(expr.right));
      }
      case 'Unary':
        if (expr.operator === '!') return 'bool';
        if (expr.operator === '~') return 'int'; // integral promotion: ~c is an int
        return this.StaticTypeOf(expr.operand);
      case 'Assign': return this.StaticTypeOf(expr.target);
      case 'CompoundAssign': return this.StaticTypeOf(expr.target);
      case 'Deref': {
        const t = this.StaticTypeOf(expr.operand);
        return t && t.endsWith('*') ? t.slice(0, -1) : null;
      }
      case 'AddressOf': {
        const t = this.StaticTypeOf(expr.operand);
        return t ? t + '*' : null;
      }
      // Everything else is a place where a type was written down.
      default: return this.DeclaredTypeOf(expr);
    }
  }

  // `+`/`-` are char arithmetic when a declared char is involved and no operand
  // is a std::string — `s + c` is concatenation in C++, `c - '0'` is arithmetic.
  private IsCharArith(le: ASTNode, l: any, re: ASTNode, r: any): boolean {
    const lc = this.IsCharExpr(le), rc = this.IsCharExpr(re);
    if (!lc && !rc) return false;
    if (!lc && typeof l === 'string') return false;
    if (!rc && typeof r === 'string') return false;
    return true;
  }

  private CharCode(v: any): number {
    return typeof v === 'string' ? v.charCodeAt(0) : v;
  }

  // ---- bitwise operands -----------------------------------------------------
  //
  // C++ requires integral operands here and applies integral promotion, so a
  // char arrives as its code and a bool as 0/1. A floating operand is a compile
  // error; values are untagged, so `4.0` is indistinguishable from `4` by value
  // alone and the DECLARED type has to settle it — the same read-only walk `/`
  // uses. Erroring rather than guessing is the point: this is a teaching tool.
  private ToIntegral(op: string, e: ASTNode, v: any): number {
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string' && v.length === 1) return v.charCodeAt(0);
    const t = this.StaticTypeOf(e);
    if (typeof v === 'number' && Number.isInteger(v) && t !== 'double' && t !== 'float') return v;
    throw new Error(`Operator '${op}' requires integer operands at line ${e.line}`);
  }

  // JS masks a shift count to 5 bits, so `1 << 40` would quietly print 256.
  // In C++ that is undefined behaviour on a 32-bit int, so name it instead.
  private CheckShiftCount(op: string, n: number, line: number): number {
    if (n < 0 || n >= 32) throw new Error(`Invalid shift count ${n} for '${op}' at line ${line}: must be 0..31`);
    return n;
  }

  private ApplyBitwise(op: string, l: number, r: number, line: number): number {
    switch (op) {
      case '&': return l & r;
      case '|': return l | r;
      case '^': return l ^ r;
      case '<<': return l << this.CheckShiftCount(op, r, line);
      case '>>': return l >> this.CheckShiftCount(op, r, line);
      default: throw new Error(`Unknown operator '${op}'`);
    }
  }

  // `c++` / `--c` on a char steps the ASCII code and stays a char, so
  // `for (char c = 'a'; c <= 'z'; c++)` walks the alphabet instead of
  // building the string "a1".
  private StepValue(operand: ASTNode, cur: any, delta: number): any {
    return typeof cur === 'string' && this.IsCharExpr(operand)
      ? String.fromCharCode(cur.charCodeAt(0) + delta)
      : cur + delta;
  }

  private CoerceToDeclared(type: string, value: any): any {
    const base = this.BaseType(type);
    if (base === 'char' && typeof value === 'number')
      return String.fromCharCode(((Math.trunc(value) % 256) + 256) % 256);
    if (typeof value === 'string' && value.length === 1 && NUMERIC_TYPES.has(base))
      value = value.charCodeAt(0);
    // C++ `int` is 32-bit two's complement and wraps on overflow; a JS number is
    // a double and does not. `| 0` IS that wrap, and it also truncates
    // `int x = 3.7` to 3 (toward zero, as C++ does). Only `int` narrows: `long`
    // and `long long` are not in the supported subset, and wrapping them at 32
    // bits would be wrong. `base` excludes `int*` — pointers hold addresses.
    if (base === 'int' && typeof value === 'number') return value | 0;
    return value;
  }

  // Every read/write of a variable's storage goes through this pair, so a
  // reference parameter transparently resolves to the slot it aliases.
  private readEntry(v: VarEntry): any {
    return v.ref ? v.ref.obj[v.ref.key] : v.value;
  }

  private writeEntry(v: VarEntry, value: any): void {
    const nv = v.isArray || v.isPointer ? value : this.CoerceToDeclared(v.type, value);
    if (v.ref) v.ref.obj[v.ref.key] = nv;
    else v.value = nv;
  }

  // Plain assignment narrows to the target's declared type, exactly as
  // declaration and compound assignment already did. Arrays and pointers pass
  // through untouched: CoerceToDeclared only converts numbers and 1-char
  // strings, and a pointer's `base` still carries its `*`.
  private setVar(name: string, value: any): void {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      const entry = this.callStack[i].vars.get(name);
      if (entry) {
        this.writeEntry(entry, entry.isArray ? value : this.CoerceToDeclared(entry.type, value));
        return;
      }
    }
    const g = this.globalVars.get(name);
    if (g) {
      this.writeEntry(g, g.isArray ? value : this.CoerceToDeclared(g.type, value));
      return;
    }
    throw new Error(`Undefined variable '${name}'`);
  }

  // Resolve the storage an `&` parameter should alias. Only lvalues that map
  // onto an (object, key) pair are bindable; anything else is a C++-level
  // error rather than a silently useless by-value copy.
  private bindRef(argExpr: ASTNode, paramName: string): RefBinding {
    if (argExpr.type === 'Identifier') {
      const v = this.lookupVar(argExpr.name);
      if (!v) throw new Error(`Undefined variable '${argExpr.name}' at line ${argExpr.line}`);
      // Passing a reference param onward forwards the original binding, so a
      // chain of any depth still aliases the one real slot.
      return v.ref ? v.ref : { obj: v, key: 'value', address: v.address };
    }
    if (argExpr.type === 'ArrayAccess' && argExpr.array.type === 'Identifier') {
      const v = this.lookupVar(argExpr.array.name);
      if (!v) throw new Error(`Undefined array '${argExpr.array.name}' at line ${argExpr.line}`);
      const arr = this.readEntry(v);
      if (!Array.isArray(arr)) throw new Error(`'${argExpr.array.name}' is not an array at line ${argExpr.line}`);
      const idx = this.evalExpr(argExpr.index);
      if (typeof idx !== 'number' || idx < 0 || idx >= arr.length)
        throw new Error(`Reference parameter '${paramName}' binds out of bounds: '${argExpr.array.name}[${idx}]' at line ${argExpr.line}`);
      return { obj: arr, key: idx, address: this.allocAddr() };
    }
    if (argExpr.type === 'MemberAccess' && argExpr.object.type === 'Identifier') {
      const v = this.lookupVar(argExpr.object.name);
      const obj = v ? this.readEntry(v) : null;
      if (!obj || typeof obj !== 'object' || Array.isArray(obj))
        throw new Error(`Cannot bind reference parameter '${paramName}' to '${argExpr.object.name}.${argExpr.member}' at line ${argExpr.line}`);
      return { obj, key: argExpr.member, address: this.allocAddr() };
    }
    throw new Error(`Cannot bind reference parameter '${paramName}' to a non-lvalue at line ${argExpr.line}`);
  }

  // Every indexed read and write funnels through here. Real C++ would read or
  // scribble on adjacent memory; this interpreter has no adjacent memory to
  // model, so the honest teaching answer is to name the index and the bounds.
  // Silently returning JS `undefined` (reads) or growing the JS array (writes)
  // both taught a false model of what a fixed-size array is.
  private checkIndex(arr: any[], idx: any, expr: ASTNode): number {
    const label = expr.type === 'ArrayAccess' && expr.array.type === 'Identifier' ? `'${expr.array.name}'` : 'array';
    if (typeof idx !== 'number' || !Number.isInteger(idx))
      throw new Error(`Array index must be an integer, got '${idx}' at line ${expr.line}`);
    if (idx < 0 || idx >= arr.length)
      throw new Error(
        `Array index out of bounds: ${label}[${idx}] — valid indices are ` +
        (arr.length === 0 ? 'none (size 0)' : `0..${arr.length - 1}`) +
        ` at line ${expr.line}`,
      );
    return idx;
  }

  private declareVar(name: string, type: string, value: any, isPointer = false, isArray = false): void {
    const v = isArray || isPointer ? value : this.CoerceToDeclared(type, value);
    this.currentFrame().vars.set(name, { type, value: v, address: this.allocAddr(), isPointer, isArray });
  }

  // `args` always holds plain evaluated values — it is what renders the call
  // stack label — while `refs` carries the aliasing for `&` params alongside it.
  private callFunction(name: string, args: any[], refs: (RefBinding | null)[] = []): any {
    const func = this.functions.get(name);
    if (!func) throw new Error(`Undefined function '${name}'`);
    if (this.callStack.length >= this.maxCallDepth)
      throw new Error(`Call depth limit exceeded (possible infinite recursion) in '${name}'`);
    const endLine = this.getLastLine(func.body);
    const frame: Frame = { name, args: [...args], vars: new Map(), startLine: func.line, endLine, activeLine: func.line, activeCallColumns: null };
    for (let i = 0; i < func.params.length; i++) {
      const param = func.params[i];
      const ref = refs[i] || null;
      const passed = i < args.length ? args[i] : 0;
      frame.vars.set(param.name, {
        type: param.type + (param.isPointer ? '*' : '') + (param.isRef ? '&' : ''),
        // Passing by value converts to the parameter's declared type; a `&`
        // param must already alias a slot of the right type, so it is untouched.
        value: ref ? undefined : (param.isPointer ? passed : this.CoerceToDeclared(param.type, passed)),
        address: ref ? ref.address : this.allocAddr(),
        isPointer: param.isPointer,
        isArray: false,
        ...(ref ? { ref } : {}),
      });
    }
    this.callStack.push(frame);
    this.recordStep(func.line);
    try {
      this.executeBlock(func.body);
    } catch (e) {
      // `char f() { return c + 1; }` narrows back to a char at the return, same
      // as any other declared-type boundary.
      if (e instanceof ReturnSignal) { this.callStack.pop(); return this.CoerceToDeclared(func.returnType, e.value); }
      throw e;
    }
    this.callStack.pop();
    return 0;
  }

  private executeBlock(block: ASTNode): void {
    for (const stmt of block.body) this.executeStmt(stmt);
  }

  private executeStmt(stmt: ASTNode): void {
    if (this.steps.length > this.maxSteps) throw new Error('Execution limit exceeded (possible infinite loop)');
    switch (stmt.type) {
      case 'Block': this.executeBlock(stmt); break;
      case 'VarDecl': this.executeVarDecl(stmt); break;
      case 'MultiVarDecl': {
        for (const decl of stmt.declarations) this.executeVarDecl(decl);
        break;
      }
      case 'If': this.executeIf(stmt); break;
      case 'For': this.executeFor(stmt); break;
      case 'While': this.executeWhile(stmt); break;
      case 'Return': {
        const val = stmt.value ? this.evalExpr(stmt.value) : undefined;
        // Record the value on the frame BEFORE the step, so the frame and its
        // return value coexist in one snapshot. Narrow it here with the same
        // return type callFunction uses below: otherwise `char f()` would show
        // 98 on a step where the caller actually receives 'b'.
        if (val !== undefined) {
          const rt = this.functions.get(this.currentFrame().name)?.returnType;
          this.currentFrame().returnValue = rt ? this.CoerceToDeclared(rt, val) : val;
          this.currentFrame().returnType = rt;
        }
        this.recordStep(stmt.line);
        throw new ReturnSignal(val);
      }
      case 'Cout': this.executeCout(stmt); break;
      case 'Cin': this.executeCin(stmt); break;
      case 'Delete': this.executeDelete(stmt); break;
      case 'ExprStmt': this.evalExpr(stmt.expr); this.recordStep(stmt.line); break;
      case 'Break': throw new BreakSignal();
      case 'Continue': throw new ContinueSignal();
    }
  }

  private executeVarDecl(stmt: ASTNode): void {
    if (stmt.isArray) {
      let values: any[];
      if (stmt.isVector && stmt.vectorSize) {
        const size = this.evalExpr(stmt.vectorSize);
        const fill = stmt.vectorFill ? this.evalExpr(stmt.vectorFill) : 0;
        values = new Array(size).fill(fill);
      } else if (stmt.arrayInit) {
        values = stmt.arrayInit.map((e: ASTNode) => this.evalExpr(e));
        // `int a[10] = {0};` declares ten elements, not one. The declared size
        // wins; C++ zero-fills the tail. Without this the new bounds check
        // would reject the standard zero-init idiom.
        values = this.padToDeclaredSize(values, stmt);
      } else {
        values = new Array(stmt.arraySize ? this.evalExpr(stmt.arraySize) : 0).fill(0);
      }
      const et = this.ElementType(stmt.varType);
      this.declareVar(stmt.name, stmt.varType, values.map(v => this.CoerceToDeclared(et, v)), false, true);
    } else {
      let value: any = 0;
      if (stmt.init) value = this.evalExpr(stmt.init);
      else if (stmt.varType === 'string') value = '';
      else if (stmt.varType === 'bool') value = false;
      else if (stmt.varType === 'char') value = '\0';
      else if (!stmt.isPointer && this.structs.has(stmt.varType)) {
        const sd = this.structs.get(stmt.varType)!;
        const obj: Record<string, any> = {};
        for (const m of sd.members) obj[m.name] = m.isPointer ? 0 : 0;
        value = obj;
      }
      this.declareVar(stmt.name, stmt.varType + (stmt.isPointer ? '*' : ''), value, stmt.isPointer);
    }
    this.recordStep(stmt.line);
  }

  private executeIf(stmt: ASTNode): void {
    const cond = this.evalExpr(stmt.condition);
    this.recordStep(stmt.line);
    if (cond) this.executeStmt(stmt.then);
    else if (stmt.elseBody) this.executeStmt(stmt.elseBody);
  }

  private executeFor(stmt: ASTNode): void {
    if (stmt.init) this.executeStmt(stmt.init);
    while (true) {
      if (stmt.condition) {
        const cond = this.evalExpr(stmt.condition);
        this.recordStep(stmt.line);
        if (!cond) break;
      }
      try { this.executeStmt(stmt.body); }
      catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) { /* fall through to update */ } else throw e; }
      if (stmt.update) this.evalExpr(stmt.update);
    }
  }

  private executeWhile(stmt: ASTNode): void {
    while (true) {
      const cond = this.evalExpr(stmt.condition);
      this.recordStep(stmt.line);
      if (!cond) break;
      try { this.executeStmt(stmt.body); }
      catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; throw e; }
    }
  }

  private executeCout(stmt: ASTNode): void {
    for (const expr of stmt.expressions) this.output += String(this.evalExpr(expr));
    this.recordStep(stmt.line);
  }

  private executeDelete(stmt: ASTNode): void {
    const addr = this.evalExpr(stmt.expr);
    if (this.heap.has(addr)) this.heap.get(addr)!.freed = true;
    this.recordStep(stmt.line);
  }

  private resolveCinTargetType(target: ASTNode): string {
    if (target.type === 'Identifier') {
      const v = this.lookupVar(target.name);
      if (!v) throw new Error(`Undefined variable '${target.name}'`);
      return v.type.replace(/&$/, ''); // `cin >> refParam` reads the referent's type
    }
    if (target.type === 'ArrayAccess') {
      const v = this.lookupVar(target.array.name);
      if (!v) throw new Error(`Undefined array '${target.array.name}'`);
      return v.type; // element type — arrays store element type (e.g. 'int')
    }
    if (target.type === 'MemberAccess') {
      const obj = this.lookupVar(target.object.name);
      if (!obj) throw new Error(`Undefined variable '${target.object.name}'`);
      const sd = this.structs.get(obj.type);
      if (sd) {
        const m = sd.members.find((mem: any) => mem.name === target.member);
        if (m) return m.isPointer ? m.type.replace('*', '') : m.type;
      }
      return 'int';
    }
    if (target.type === 'Deref') {
      if (target.operand.type === 'Identifier') {
        const v = this.lookupVar(target.operand.name);
        if (v && v.type.endsWith('*')) return v.type.slice(0, -1);
      }
      return 'int';
    }
    return 'int';
  }

  private executeCin(stmt: ASTNode): void {
    for (const target of stmt.targets) {
      if (this.stdinPos >= this.stdinBuffer.length) {
        throw new Error(`Not enough input provided for cin at line ${stmt.line}`);
      }
      const raw = this.stdinBuffer[this.stdinPos++];
      const varType = this.resolveCinTargetType(target);
      let parsed: any;
      if (varType === 'int') parsed = parseInt(raw, 10);
      else if (varType === 'float' || varType === 'double') parsed = parseFloat(raw);
      else if (varType === 'char') parsed = raw[0] || '\0';
      else if (varType === 'string') parsed = raw;
      else if (varType === 'bool') parsed = raw !== '0' && raw.toLowerCase() !== 'false';
      else parsed = isNaN(Number(raw)) ? raw : Number(raw);
      if (typeof parsed === 'number' && isNaN(parsed)) {
        throw new Error(`Invalid input '${raw}' for type '${varType}' at line ${stmt.line}`);
      }
      this.assignTo(target, parsed);
    }
    this.recordStep(stmt.line);
  }

  private evalExpr(expr: ASTNode): any {
    switch (expr.type) {
      case 'NumberLit': return expr.value;
      case 'StringLit': return expr.value;
      case 'CharLit': return expr.value;
      case 'BoolLit': return expr.value;
      case 'Nullptr': return 0;
      case 'Cast': {
        const val = this.evalExpr(expr.operand);
        if (expr.castType === 'int') return typeof val === 'number' ? Math.trunc(val) : parseInt(val, 10);
        if (expr.castType === 'float' || expr.castType === 'double') return Number(val);
        if (expr.castType === 'bool') return !!val;
        if (expr.castType === 'char') return typeof val === 'number' ? String.fromCharCode(val) : val;
        if (expr.castType === 'string') return String(val);
        return val;
      }
      case 'Identifier': {
        const v = this.lookupVar(expr.name);
        if (!v) throw new Error(`Undefined variable '${expr.name}' at line ${expr.line}`);
        return this.readEntry(v);
      }
      case 'Binary': {
        // C++ short-circuits && and ||: the right operand is not evaluated when
        // the left already decides the result. Evaluating both eagerly broke the
        // standard guard idiom `j >= 0 && a[j] > key`, which relies on the guard
        // to keep the index in range. `l ? r : l` / `l ? l : r` reproduce the
        // previous return values exactly — only the evaluation becomes lazy.
        if (expr.operator === '&&') { const l = this.evalExpr(expr.left); return l ? this.evalExpr(expr.right) : l; }
        if (expr.operator === '||') { const l = this.evalExpr(expr.left); return l ? l : this.evalExpr(expr.right); }
        const l = this.evalExpr(expr.left), r = this.evalExpr(expr.right);
        // Comparing a declared char against a number compares its ASCII code;
        // char-vs-char stays a string compare, which is already correct for ASCII.
        if (['<', '>', '<=', '>=', '==', '!='].includes(expr.operator)) {
          const cl = this.IsCharExpr(expr.left) && typeof r === 'number';
          const cr = this.IsCharExpr(expr.right) && typeof l === 'number';
          if (cl || cr) {
            const a = this.CharCode(l), b = this.CharCode(r);
            switch (expr.operator) {
              case '<': return a < b;
              case '>': return a > b;
              case '<=': return a <= b;
              case '>=': return a >= b;
              case '==': return a === b;
              case '!=': return a !== b;
            }
          }
        }
        switch (expr.operator) {
          case '+':
            if (this.IsCharArith(expr.left, l, expr.right, r)) return this.CharCode(l) + this.CharCode(r);
            return (typeof l === 'string' || typeof r === 'string') ? String(l) + String(r) : l + r;
          case '-':
            if (this.IsCharArith(expr.left, l, expr.right, r)) return this.CharCode(l) - this.CharCode(r);
            return l - r;
          case '*': return l * r;
          case '/': {
            // C++ picks `/`'s meaning from the operands' STATIC types. Fall back
            // to the old value-based guess only where no type was written down.
            const t = this.StaticTypeOf(expr);
            const integral = t === null ? Number.isInteger(l) && Number.isInteger(r) : INTEGRAL_TYPES.has(t);
            return integral ? Math.trunc(l / r) : l / r;
          }
          case '%': return l % r;
          case '&': case '|': case '^': case '<<': case '>>':
            return this.ApplyBitwise(
              expr.operator,
              this.ToIntegral(expr.operator, expr.left, l),
              this.ToIntegral(expr.operator, expr.right, r),
              expr.line,
            );
          case '==': return l === r;
          case '!=': return l !== r;
          case '<': return l < r;
          case '>': return l > r;
          case '<=': return l <= r;
          case '>=': return l >= r;
          case '&&': return l && r;
          case '||': return l || r;
          default: throw new Error(`Unknown operator '${expr.operator}'`);
        }
      }
      case 'Unary': {
        const o = this.evalExpr(expr.operand);
        if (expr.operator === '!') return !o;
        if (expr.operator === '~') return ~this.ToIntegral('~', expr.operand, o);
        return -o;
      }
      case 'Assign': {
        const value = this.evalExpr(expr.value);
        this.assignTo(expr.target, value);
        return value;
      }
      case 'CompoundAssign': {
        const cur = this.evalLValue(expr.target), r = this.evalExpr(expr.value);
        let nv: any;
        switch (expr.operator) {
          case '+=': nv = this.IsCharArith(expr.target, cur, expr.value, r) ? this.CharCode(cur) + this.CharCode(r) : cur + r; break;
          case '-=': nv = this.IsCharArith(expr.target, cur, expr.value, r) ? this.CharCode(cur) - this.CharCode(r) : cur - r; break;
          case '*=': nv = cur * r; break;
          // Divide honestly. The result lands in the target, so the narrowing
          // below truncates it when — and only when — the target is integral.
          case '/=': nv = cur / r; break;
          case '%=': nv = cur % r; break;
          case '&=': case '|=': case '^=': case '<<=': case '>>=': {
            const op = expr.operator.slice(0, -1);
            nv = this.ApplyBitwise(
              op,
              this.ToIntegral(op, expr.target, cur),
              this.ToIntegral(op, expr.value, r),
              expr.line,
            );
            break;
          }
          default: throw new Error(`Unknown operator '${expr.operator}'`);
        }
        // The compound result lands in the target, so it narrows to the target's
        // declared type — `char c; c += 1;` stores and yields 'b', not 98.
        const tt = this.DeclaredTypeOf(expr.target);
        if (tt) nv = this.CoerceToDeclared(tt, nv);
        this.assignTo(expr.target, nv);
        return nv;
      }
      case 'PostfixInc': { const v = this.evalLValue(expr.operand); this.assignTo(expr.operand, this.StepValue(expr.operand, v, 1)); return v; }
      case 'PostfixDec': { const v = this.evalLValue(expr.operand); this.assignTo(expr.operand, this.StepValue(expr.operand, v, -1)); return v; }
      case 'PrefixInc': { const v = this.StepValue(expr.operand, this.evalLValue(expr.operand), 1); this.assignTo(expr.operand, v); return v; }
      case 'PrefixDec': { const v = this.StepValue(expr.operand, this.evalLValue(expr.operand), -1); this.assignTo(expr.operand, v); return v; }
      case 'ArrayAccess': {
        const arr = this.evalExpr(expr.array), idx = this.evalExpr(expr.index);
        // Track array access for visualization
        if (expr.array.type === 'Identifier' && typeof idx === 'number') {
          // Try to find the label from the index expression (e.g. a[l] → label "l")
          const label = expr.index.type === 'Identifier' ? expr.index.name : String(idx);
          this.currentArrayAccesses.push({ arrayName: expr.array.name, index: idx, label });
        }
        if (Array.isArray(arr)) return arr[this.checkIndex(arr, idx, expr)];
        throw new Error('Not an array');
      }
      case 'Call': {
        // Handle member function calls (e.g., v.push_back(x), v.size())
        if (expr.callee.type === 'MemberAccess') {
          const entry = this.lookupVar(expr.callee.object.name);
          if (!entry) throw new Error(`Undefined variable '${expr.callee.object.name}'`);
          // Read through a possible reference binding; the container itself is
          // shared, so push_back/clear still mutate the caller's vector.
          const obj = { value: this.readEntry(entry) };
          const method = expr.callee.member;
          const args = expr.args.map((a: ASTNode) => this.evalExpr(a));
          if (method === 'push_back') {
            if (!Array.isArray(obj.value)) throw new Error(`${expr.callee.object.name} is not a vector`);
            obj.value.push(args[0]);
            return undefined;
          }
          if (method === 'pop_back') {
            if (!Array.isArray(obj.value)) throw new Error(`${expr.callee.object.name} is not a vector`);
            return obj.value.pop();
          }
          if (method === 'size') {
            if (Array.isArray(obj.value)) return obj.value.length;
            if (typeof obj.value === 'string') return obj.value.length;
            throw new Error(`${expr.callee.object.name} has no size()`);
          }
          if (method === 'empty') {
            if (Array.isArray(obj.value)) return obj.value.length === 0;
            throw new Error(`${expr.callee.object.name} has no empty()`);
          }
          if (method === 'front') {
            if (Array.isArray(obj.value)) return obj.value[0];
            throw new Error(`${expr.callee.object.name} has no front()`);
          }
          if (method === 'back') {
            if (Array.isArray(obj.value)) return obj.value[obj.value.length - 1];
            throw new Error(`${expr.callee.object.name} has no back()`);
          }
          if (method === 'clear') {
            if (Array.isArray(obj.value)) { obj.value.length = 0; return undefined; }
            throw new Error(`${expr.callee.object.name} has no clear()`);
          }
          throw new Error(`Unknown method '${method}'`);
        }
        const name = expr.callee.name;
        // `&` params need the argument's storage, not just its value, so the
        // callee's param list is consulted before the arguments are evaluated.
        const params: any[] = this.functions.get(name)?.params ?? [];
        const args: any[] = [];
        const refs: (RefBinding | null)[] = [];
        for (let i = 0; i < expr.args.length; i++) {
          const param = params[i];
          if (param && param.isRef) {
            const binding = this.bindRef(expr.args[i], param.name);
            refs.push(binding);
            // Read through the binding instead of re-evaluating the argument,
            // so `f(a[i++])` does not step the index twice.
            args.push(binding.obj[binding.key]);
          } else {
            refs.push(null);
            args.push(this.evalExpr(expr.args[i]));
          }
        }
        // Update parent frame's activeLine and call columns before entering the function
        if (expr.line) this.currentFrame().activeLine = expr.line;
        if (expr.col && expr.endCol) {
          this.currentFrame().activeCallColumns = { startCol: expr.col, endCol: expr.endCol };
        }
        const result = this.callFunction(name, args, refs);
        // Clear call columns after returning
        this.currentFrame().activeCallColumns = null;
        return result;
      }
      case 'MemberAccess': {
        // obj.member - for struct variables on stack
        const entry = this.lookupVar(expr.object.name);
        const obj = entry ? this.readEntry(entry) : null;
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          return obj[expr.member];
        }
        throw new Error(`Cannot access member '${expr.member}' on '${expr.object.name}'`);
      }
      case 'ArrowAccess': {
        // ptr->member - dereference pointer then access member
        const addr = this.evalExpr(expr.object);
        if (addr === 0) throw new Error('Null pointer dereference');
        const heapEntry = this.heap.get(addr);
        if (!heapEntry) throw new Error(`Invalid pointer dereference at address ${addr}`);
        if (heapEntry.freed) throw new Error('Dereferencing freed memory');
        if (typeof heapEntry.value === 'object' && heapEntry.value !== null) {
          return heapEntry.value[expr.member];
        }
        throw new Error(`Cannot access member '${expr.member}'`);
      }
      case 'AddressOf': {
        const v = this.lookupVar(expr.operand.name);
        if (!v) throw new Error(`Undefined variable '${expr.operand.name}'`);
        return v.address;
      }
      case 'Deref': {
        const addr = this.evalExpr(expr.operand);
        if (this.heap.has(addr)) {
          const h = this.heap.get(addr)!;
          if (h.freed) throw new Error('Dereferencing freed memory');
          return h.value;
        }
        for (const frame of this.callStack)
          for (const [, v] of frame.vars)
            if (v.address === addr) return this.readEntry(v);
        throw new Error(`Invalid pointer dereference at address ${addr}`);
      }
      case 'New': {
        const addr = this.allocAddr();
        // Check if it's a struct type
        const structDef = this.structs.get(expr.newType);
        if (structDef) {
          const obj: Record<string, any> = {};
          const args = expr.initArgs ? expr.initArgs.map((a: ASTNode) => this.evalExpr(a)) : [];
          for (let i = 0; i < structDef.members.length; i++) {
            const m = structDef.members[i];
            obj[m.name] = i < args.length ? args[i] : (m.isPointer ? 0 : 0);
          }
          this.heap.set(addr, { type: expr.newType, value: obj, freed: false });
        } else {
          const value = expr.initValue ? this.evalExpr(expr.initValue) : 0;
          this.heap.set(addr, { type: expr.newType, value, freed: false });
        }
        return addr;
      }
      default: throw new Error(`Unknown expression type '${expr.type}'`);
    }
  }

  private evalLValue(expr: ASTNode): any {
    if (expr.type === 'Identifier') {
      const v = this.lookupVar(expr.name);
      if (!v) throw new Error(`Undefined variable '${expr.name}'`);
      return this.readEntry(v);
    }
    if (expr.type === 'ArrayAccess') {
      const arr = this.evalExpr(expr.array), idx = this.evalExpr(expr.index);
      if (!Array.isArray(arr)) throw new Error('Not an array');
      return arr[this.checkIndex(arr, idx, expr)];
    }
    if (expr.type === 'Deref') return this.evalExpr(expr);
    if (expr.type === 'ArrowAccess') return this.evalExpr(expr);
    if (expr.type === 'MemberAccess') return this.evalExpr(expr);
    throw new Error('Not an lvalue');
  }

  private assignTo(target: ASTNode, value: any): void {
    if (target.type === 'Identifier') { this.setVar(target.name, value); return; }
    if (target.type === 'ArrayAccess') {
      const v = this.lookupVar(target.array.name);
      if (!v) throw new Error(`Undefined array '${target.array.name}'`);
      const arr = this.readEntry(v);
      if (!Array.isArray(arr)) throw new Error(`'${target.array.name}' is not an array at line ${target.line}`);
      arr[this.checkIndex(arr, this.evalExpr(target.index), target)] = this.CoerceToDeclared(this.ElementType(v.type), value);
      return;
    }
    if (target.type === 'ArrowAccess') {
      const addr = this.evalExpr(target.object);
      if (addr === 0) throw new Error('Null pointer dereference');
      const heapEntry = this.heap.get(addr);
      if (!heapEntry) throw new Error(`Invalid pointer at address ${addr}`);
      if (typeof heapEntry.value === 'object' && heapEntry.value !== null) {
        const mt = this.MemberTypeOf(target.object, target.member);
        heapEntry.value[target.member] = mt ? this.CoerceToDeclared(mt, value) : value;
        return;
      }
      throw new Error(`Cannot assign to member '${target.member}'`);
    }
    if (target.type === 'MemberAccess') {
      const entry = this.lookupVar(target.object.name);
      const obj = entry ? this.readEntry(entry) : null;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const mt = this.MemberTypeOf(target.object, target.member);
        obj[target.member] = mt ? this.CoerceToDeclared(mt, value) : value;
        return;
      }
      throw new Error(`Cannot assign to member '${target.member}'`);
    }
    if (target.type === 'Deref') {
      const addr = this.evalExpr(target.operand);
      if (this.heap.has(addr)) {
        const h = this.heap.get(addr)!;
        h.value = typeof h.value === 'object' && h.value !== null ? value : this.CoerceToDeclared(h.type, value);
        return;
      }
      for (const frame of this.callStack)
        for (const [, v] of frame.vars)
          if (v.address === addr) { this.writeEntry(v, value); return; }
      throw new Error(`Invalid pointer assignment at address ${addr}`);
    }
    throw new Error('Cannot assign to this expression');
  }

  private snapVarEntry(name: string, v: VarEntry): VariableInfo {
    // Read through any reference binding so the snapshot shows the aliased
    // value, then copy exactly as before — the recording model is unchanged.
    const val = this.readEntry(v);
    return {
      name,
      type: v.type,
      value: Array.isArray(val) ? [...val] : (typeof val === 'object' && val !== null ? { ...val } : val),
      address: v.address,
      isPointer: v.isPointer,
      isArray: v.isArray,
      changed: false,
      ...(v.isPointer ? { pointsTo: val as number } : {}),
    };
  }

  private recordStep(line: number): void {
    this.currentFrame().activeLine = line;
    const step: ExecutionStep = {
      line,
      arrayAccesses: [...this.currentArrayAccesses],
      callStack: this.callStack.map((frame) => ({
        name: frame.name,
        args: frame.args,
        startLine: frame.startLine,
        endLine: frame.endLine,
        activeLine: frame.activeLine,
        activeCallColumns: frame.activeCallColumns ? { ...frame.activeCallColumns } : null,
        variables: Array.from(frame.vars.entries()).map(([name, v]) => this.snapVarEntry(name, v)),
        // Conditional so the key exists only on a frame that is actively
        // returning — at most one frame per step — instead of multiplying
        // across every frame of all ~10,000 steps. A struct returned by value
        // is copied, not aliased, like every other snapshotted value.
        ...(frame.returnValue !== undefined
          ? {
              returnValue:
                typeof frame.returnValue === 'object' && frame.returnValue !== null
                  ? Array.isArray(frame.returnValue)
                    ? [...frame.returnValue]
                    : { ...frame.returnValue }
                  : frame.returnValue,
              ...(frame.returnType ? { returnType: frame.returnType } : {}),
            }
          : {}),
      })),
      globals: Array.from(this.globalVars.entries()).map(([name, v]) => this.snapVarEntry(name, v)),
      output: this.output,
      heap: Array.from(this.heap.entries()).map(([addr, h]) => ({
        address: addr, type: h.type,
        value: typeof h.value === 'object' && h.value !== null ? { ...h.value } : h.value,
        freed: h.freed,
      })),
    };

    if (this.steps.length > 0) {
      const prev = this.steps[this.steps.length - 1];
      for (let fi = 0; fi < step.callStack.length; fi++) {
        const frame = step.callStack[fi];
        const prevFrame = fi < prev.callStack.length ? prev.callStack[fi] : null;
        for (const v of frame.variables) {
          if (prevFrame) {
            const pv = prevFrame.variables.find(p => p.name === v.name);
            v.changed = pv ? JSON.stringify(v.value) !== JSON.stringify(pv.value) : true;
          } else v.changed = true;
        }
      }
      for (const gv of step.globals!) {
        const pgv = prev.globals?.find(p => p.name === gv.name);
        gv.changed = pgv ? JSON.stringify(gv.value) !== JSON.stringify(pgv.value) : true;
      }
    }

    this.steps.push(step);
    this.currentArrayAccesses = [];
  }
}

// ===================== PUBLIC API =====================

export function executeCode(code: string, stdin = ''): { steps: ExecutionStep[]; error?: string } {
  try {
    const tokens = tokenize(code);
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const interpreter = new Interpreter();
    const result = interpreter.run(ast, stdin);
    // Add nextLine info to each step
    for (let i = 0; i < result.steps.length - 1; i++) {
      result.steps[i].nextLine = result.steps[i + 1].line;
    }
    return result;
  } catch (e: any) {
    return { steps: [], error: e.message };
  }
}
