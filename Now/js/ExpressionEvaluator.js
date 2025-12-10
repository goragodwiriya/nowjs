class ExpressionEvaluator {
  static operators = {
    '+': (a, b) => Number(a) + Number(b),
    '-': (a, b) => Number(a) - Number(b),
    '*': (a, b) => Number(a) * Number(b),
    '/': (a, b) => Number(a) / Number(b),
    '%': (a, b) => Number(a) % Number(b),
    '===': (a, b) => a === b,
    '!==': (a, b) => a !== b,
    '!=': (a, b) => a != b,
    '>': (a, b) => a > b,
    '>=': (a, b) => a >= b,
    '<': (a, b) => a < b,
    '<=': (a, b) => a <= b,
    '==': (a, b) => a == b,
    '&&': (a, b) => a && b,
    '||': (a, b) => a || b,
    '!': a => !a,

    '+str': (a, b) => String(a) + String(b)
  };

  static evaluate(expression, state, context) {
    try {
      if (!expression?.trim()) return undefined;

      if (expression === '!true' || expression === '!false') {
        const value = expression === '!true' ? true : false;
        return !value;
      }

      // Handle string literals (single or double quoted)
      const stringMatch = expression.match(/^(['"])(.*)(\1)$/);
      if (stringMatch) {
        return stringMatch[2]; // Return string without quotes
      }

      // Handle ternary expression: condition ? trueValue : falseValue
      const ternaryMatch = expression.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
      if (ternaryMatch) {
        const [, condition, trueExpr, falseExpr] = ternaryMatch;
        const conditionResult = this.evaluate(condition.trim(), state, context);
        // Check for truthy value (handles "0", "", null, undefined, false as falsy)
        const isTruthy = conditionResult && conditionResult !== '0' && conditionResult !== 0;
        return isTruthy
          ? this.evaluate(trueExpr.trim(), state, context)
          : this.evaluate(falseExpr.trim(), state, context);
      }

      if (/^[\w.]+$/.test(expression)) {
        const value = this.getPropertyPath(expression, state, context);
        return value;
      }

      const tokens = this.tokenize(expression);

      let value;
      const postfix = this.toPostfix(tokens);
      if (postfix.length === 2) {
        const property = this.getPropertyPath(postfix[1], state, context);
        value = property === undefined ? undefined : state[postfix[0]].call(context, property);
      } else {
        value = this.evaluatePostfix(postfix, state, context);
      }
      return value;
    } catch (error) {
      ErrorManager.handle(error, {
        context: 'ExpressionEvaluator.evaluate',
        data: {
          expression,
          state,
          context
        }
      });
      return undefined;
    }
  }

  static getPropertyPath(path, state, context) {
    if (typeof path !== 'string') {
      return path;
    }

    return path.split('.').reduce((obj, key) => {
      if (obj === undefined || obj === null) return undefined;

      if (obj.computed && typeof obj.computed[key] === 'function') {
        return obj.computed[key].call(obj);
      }

      let value = obj[key];
      if (value !== undefined) {
        if (typeof value === 'function') {
          value = value.call(context);
        }
        return value;
      }

      if (state[key]) {
        const value = typeof state[key] === 'function' ? state[key].call(context) : state[key];
        return value;
      }

      if (obj.state && obj.state.hasOwnProperty(key)) {
        return obj.state[key];
      }

      return undefined;
    }, context || state);
  }

  static tokenize(expression) {
    const tokens = [];
    let current = '';

    const pushToken = () => {
      if (current) {
        tokens.push(current);
        current = '';
      }
    };

    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];

      if (char === '"' || char === "'") {
        const quote = char;
        pushToken();
        current = char;
        i++;
        while (i < expression.length && expression[i] !== quote) {
          current += expression[i];
          i++;
        }
        current += quote;
        pushToken();
        continue;
      }

      if (/[+\-*/%=!&|<>]/.test(char)) {
        pushToken();
        let operator = char;

        let next = expression[i + 1];
        while (next && /[=&|><]/.test(next)) {
          operator += next;
          i++;
          next = expression[i + 1];
        }

        tokens.push(operator);
        continue;
      }

      if (char === '(' || char === ')') {
        pushToken();
        tokens.push(char);
        continue;
      }

      if (/\s/.test(char)) {
        pushToken();
        continue;
      }

      current += char;
    }

    pushToken();
    return tokens;
  }

  static toPostfix(tokens) {
    const output = [];
    const operators = [];
    const precedence = {
      '!': 4,
      '*': 3, '/': 3, '%': 3,
      '+': 2, '-': 2,
      '>=': 1, '<=': 1, '>': 1, '<': 1,
      '===': 1, '!==': 1, '==': 1, '!=': 1,
      '&&': 0, '||': 0
    };

    tokens.forEach(token => {
      if (token in this.operators) {
        while (operators.length > 0 &&
          operators[operators.length - 1] !== '(' &&
          precedence[operators[operators.length - 1]] >= precedence[token]) {
          output.push(operators.pop());
        }
        operators.push(token);
      } else if (token === '(') {
        operators.push(token);
      } else if (token === ')') {
        while (operators.length > 0 && operators[operators.length - 1] !== '(') {
          output.push(operators.pop());
        }
        operators.pop();
      } else {
        output.push(token);
      }
    });

    while (operators.length > 0) {
      output.push(operators.pop());
    }

    return output;
  }

  static evaluatePostfix(postfix, state, context) {
    const stack = [];

    postfix.forEach(token => {
      if (token in this.operators) {
        const operator = this.operators[token];
        const arity = token === '!' ? 1 : 2;
        const args = stack.splice(-arity);

        const values = args.map(arg => {
          if (/^["'].*["']$/.test(arg)) {
            return arg.slice(1, -1);
          }
          if (/^-?\d+(\.\d+)?$/.test(arg)) {
            return Number(arg);
          }
          if (arg === 'true') return true;
          if (arg === 'false') return false;
          if (arg === 'null') return null;
          if (arg === 'undefined') return undefined;
          return this.getPropertyPath(arg, state, context);
        });

        if (arity === 1) {
          if (values[0] === undefined) return undefined;
        } else {
          if (values[0] === undefined || values[1] === undefined) return undefined;
        }

        if (token === '+' && (typeof values[0] === 'string' || typeof values[1] === 'string')) {
          stack.push(String(values[0]) + String(values[1]));
        } else {
          stack.push(operator(...values));
        }
      } else {
        stack.push(token);
      }
    });

    return stack[0];
  }
}

window.ExpressionEvaluator = ExpressionEvaluator;
