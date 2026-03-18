// ===================== PUBLIC TYPES =====================

export interface ExecutionStep {
  line: number;
  nextLine?: number;
  callStack: StackFrameInfo[];
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
      while (i < code.length && /[\d.]/.test(code[i])) { num += code[i++]; col++; }
      tokens.push({ type: 'number', value: num, line, col: startCol }); continue;
    }

    if (/[a-zA-Z_]/.test(code[i])) {
      let id = ''; const startCol = col;
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) { id += code[i++]; col++; }
      if (id === 'using') { while (i < code.length && code[i] !== ';') { if (code[i] === '\n') { line++; col = 1; } else col++; i++; } i++; col++; continue; }
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

    const two = code.substring(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '<<', '>>'].includes(two)) {
      tokens.push({ type: 'operator', value: two, line, col }); i += 2; col += 2; continue;
    }

    if ('+-*/%=<>!&'.includes(code[i])) {
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
        expressions.push(this.parseExpr());
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
      targets.push(this.parseExpr());
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
    if (p.type === 'operator' && ['+=', '-=', '*=', '/=', '%='].includes(p.value)) {
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
    let left = this.parseEquality();
    while (this.peek().type === 'operator' && this.peek().value === '&&') {
      const line = this.advance().line;
      left = { type: 'Binary', operator: '&&', left, right: this.parseEquality(), line };
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
    let left = this.parseAddition();
    while (this.peek().type === 'operator' && ['<', '>', '<=', '>='].includes(this.peek().value)) {
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
    if (p.type === 'number') { this.advance(); return { type: 'NumberLit', value: Number(p.value), line: p.line }; }
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

class ReturnSignal { constructor(public value: any) {} }
class BreakSignal {}
class ContinueSignal {}

interface VarEntry {
  type: string;
  value: any;
  address: number;
  isPointer: boolean;
  isArray: boolean;
}

interface Frame {
  name: string;
  args?: any[];
  vars: Map<string, VarEntry>;
  startLine: number;
  endLine: number;
  activeLine: number;
  activeCallColumns: { startCol: number; endCol: number } | null;
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
  private heap = new Map<number, HeapEntry>();
  private nextAddr = 100;
  private output = '';
  private steps: ExecutionStep[] = [];
  private maxSteps = 10000;
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
      if (!this.functions.has('main')) throw new Error('No main() function found');
      this.callFunction('main', []);
      return { steps: this.steps };
    } catch (e: any) {
      if (e instanceof ReturnSignal) return { steps: this.steps };
      return { steps: this.steps, error: e.message };
    }
  }

  private allocAddr(): number { const a = this.nextAddr; this.nextAddr += 4; return a; }

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
    return undefined;
  }

  private setVar(name: string, value: any): void {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      if (this.callStack[i].vars.has(name)) {
        this.callStack[i].vars.get(name)!.value = value;
        return;
      }
    }
    throw new Error(`Undefined variable '${name}'`);
  }

  private declareVar(name: string, type: string, value: any, isPointer = false, isArray = false): void {
    this.currentFrame().vars.set(name, { type, value, address: this.allocAddr(), isPointer, isArray });
  }

  private callFunction(name: string, args: any[]): any {
    const func = this.functions.get(name);
    if (!func) throw new Error(`Undefined function '${name}'`);
    const endLine = this.getLastLine(func.body);
    const frame: Frame = { name, args: [...args], vars: new Map(), startLine: func.line, endLine, activeLine: func.line, activeCallColumns: null };
    for (let i = 0; i < func.params.length; i++) {
      const param = func.params[i];
      frame.vars.set(param.name, {
        type: param.type + (param.isPointer ? '*' : ''),
        value: i < args.length ? args[i] : 0,
        address: this.allocAddr(),
        isPointer: param.isPointer,
        isArray: false,
      });
    }
    this.callStack.push(frame);
    this.recordStep(func.line);
    try {
      this.executeBlock(func.body);
    } catch (e) {
      if (e instanceof ReturnSignal) { this.callStack.pop(); return e.value; }
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
      } else {
        values = new Array(stmt.arraySize ? this.evalExpr(stmt.arraySize) : 0).fill(0);
      }
      this.declareVar(stmt.name, stmt.varType, values, false, true);
    } else {
      let value: any = 0;
      if (stmt.init) value = this.evalExpr(stmt.init);
      else if (stmt.varType === 'string') value = '';
      else if (stmt.varType === 'bool') value = false;
      else if (stmt.varType === 'char') value = '\0';
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

  private executeCin(stmt: ASTNode): void {
    for (const target of stmt.targets) {
      if (this.stdinPos >= this.stdinBuffer.length) {
        throw new Error(`Not enough input provided for cin at line ${stmt.line}`);
      }
      const raw = this.stdinBuffer[this.stdinPos++];
      const v = this.lookupVar(target.name);
      if (!v) throw new Error(`Undefined variable '${target.name}' at line ${stmt.line}`);
      let parsed: any;
      if (v.type === 'int') parsed = parseInt(raw, 10);
      else if (v.type === 'float' || v.type === 'double') parsed = parseFloat(raw);
      else if (v.type === 'char') parsed = raw[0] || '\0';
      else if (v.type === 'string') parsed = raw;
      else if (v.type === 'bool') parsed = raw !== '0' && raw.toLowerCase() !== 'false';
      else parsed = isNaN(Number(raw)) ? raw : Number(raw);
      if (typeof parsed === 'number' && isNaN(parsed)) {
        throw new Error(`Invalid input '${raw}' for type '${v.type}' at line ${stmt.line}`);
      }
      this.setVar(target.name, parsed);
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
        return v.value;
      }
      case 'Binary': {
        const l = this.evalExpr(expr.left), r = this.evalExpr(expr.right);
        switch (expr.operator) {
          case '+': return (typeof l === 'string' || typeof r === 'string') ? String(l) + String(r) : l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': return Number.isInteger(l) && Number.isInteger(r) ? Math.trunc(l / r) : l / r;
          case '%': return l % r;
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
        return expr.operator === '!' ? !o : -o;
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
          case '+=': nv = cur + r; break;
          case '-=': nv = cur - r; break;
          case '*=': nv = cur * r; break;
          case '/=': nv = Math.trunc(cur / r); break;
          case '%=': nv = cur % r; break;
          default: throw new Error(`Unknown operator '${expr.operator}'`);
        }
        this.assignTo(expr.target, nv);
        return nv;
      }
      case 'PostfixInc': { const v = this.evalLValue(expr.operand); this.assignTo(expr.operand, v + 1); return v; }
      case 'PostfixDec': { const v = this.evalLValue(expr.operand); this.assignTo(expr.operand, v - 1); return v; }
      case 'PrefixInc': { const v = this.evalLValue(expr.operand) + 1; this.assignTo(expr.operand, v); return v; }
      case 'PrefixDec': { const v = this.evalLValue(expr.operand) - 1; this.assignTo(expr.operand, v); return v; }
      case 'ArrayAccess': {
        const arr = this.evalExpr(expr.array), idx = this.evalExpr(expr.index);
        // Track array access for visualization
        if (expr.array.type === 'Identifier' && typeof idx === 'number') {
          // Try to find the label from the index expression (e.g. a[l] → label "l")
          const label = expr.index.type === 'Identifier' ? expr.index.name : String(idx);
          this.currentArrayAccesses.push({ arrayName: expr.array.name, index: idx, label });
        }
        if (Array.isArray(arr)) return arr[idx];
        throw new Error('Not an array');
      }
      case 'Call': {
        // Handle member function calls (e.g., v.push_back(x), v.size())
        if (expr.callee.type === 'MemberAccess') {
          const obj = this.lookupVar(expr.callee.object.name);
          if (!obj) throw new Error(`Undefined variable '${expr.callee.object.name}'`);
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
        const args = expr.args.map((a: ASTNode) => this.evalExpr(a));
        // Update parent frame's activeLine and call columns before entering the function
        if (expr.line) this.currentFrame().activeLine = expr.line;
        if (expr.col && expr.endCol) {
          this.currentFrame().activeCallColumns = { startCol: expr.col, endCol: expr.endCol };
        }
        const result = this.callFunction(name, args);
        // Clear call columns after returning
        this.currentFrame().activeCallColumns = null;
        return result;
      }
      case 'MemberAccess': {
        // obj.member - for struct variables on stack
        const obj = this.lookupVar(expr.object.name);
        if (obj && typeof obj.value === 'object' && obj.value !== null && !Array.isArray(obj.value)) {
          return obj.value[expr.member];
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
            if (v.address === addr) return v.value;
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
      return v.value;
    }
    if (expr.type === 'ArrayAccess') {
      const arr = this.evalExpr(expr.array), idx = this.evalExpr(expr.index);
      return arr[idx];
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
      v.value[this.evalExpr(target.index)] = value;
      return;
    }
    if (target.type === 'ArrowAccess') {
      const addr = this.evalExpr(target.object);
      if (addr === 0) throw new Error('Null pointer dereference');
      const heapEntry = this.heap.get(addr);
      if (!heapEntry) throw new Error(`Invalid pointer at address ${addr}`);
      if (typeof heapEntry.value === 'object' && heapEntry.value !== null) {
        heapEntry.value[target.member] = value;
        return;
      }
      throw new Error(`Cannot assign to member '${target.member}'`);
    }
    if (target.type === 'MemberAccess') {
      const obj = this.lookupVar(target.object.name);
      if (obj && typeof obj.value === 'object' && obj.value !== null && !Array.isArray(obj.value)) {
        obj.value[target.member] = value;
        return;
      }
      throw new Error(`Cannot assign to member '${target.member}'`);
    }
    if (target.type === 'Deref') {
      const addr = this.evalExpr(target.operand);
      if (this.heap.has(addr)) { this.heap.get(addr)!.value = value; return; }
      for (const frame of this.callStack)
        for (const [, v] of frame.vars)
          if (v.address === addr) { v.value = value; return; }
      throw new Error(`Invalid pointer assignment at address ${addr}`);
    }
    throw new Error('Cannot assign to this expression');
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
        variables: Array.from(frame.vars.entries()).map(([name, v]) => ({
          name,
          type: v.type,
          value: Array.isArray(v.value) ? [...v.value] : (typeof v.value === 'object' && v.value !== null ? { ...v.value } : v.value),
          address: v.address,
          isPointer: v.isPointer,
          isArray: v.isArray,
          changed: false,
          ...(v.isPointer ? { pointsTo: v.value as number } : {}),
        })),
      })),
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
