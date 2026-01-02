/**
 * CommandManager - Editor command execution system
 * Replaces deprecated document.execCommand with modern approach
 *
 * @author Goragod Wiriya
 * @version 1.0
 */
import EventBus from './EventBus.js';

class CommandManager {
  /**
   * @param {RichTextEditor} editor - Editor instance
   */
  constructor(editor) {
    this.editor = editor;
    this.commands = new Map();
    this.registerBuiltInCommands();
  }

  /**
   * Register built-in commands
   */
  registerBuiltInCommands() {
    // Text formatting
    this.register('bold', {
      execute: () => this.execNative('bold'),
      isActive: () => document.queryCommandState('bold'),
      shortcut: 'Ctrl+B'
    });

    this.register('italic', {
      execute: () => this.execNative('italic'),
      isActive: () => document.queryCommandState('italic'),
      shortcut: 'Ctrl+I'
    });

    this.register('underline', {
      execute: () => this.execNative('underline'),
      isActive: () => document.queryCommandState('underline'),
      shortcut: 'Ctrl+U'
    });

    this.register('strikethrough', {
      execute: () => this.execNative('strikeThrough'),
      isActive: () => document.queryCommandState('strikeThrough')
    });

    // Block formatting
    this.register('heading', {
      execute: (level) => this.formatBlock(`h${level}`),
      isActive: (level) => this.isBlockType(`h${level}`)
    });

    this.register('paragraph', {
      execute: () => this.formatBlock('p'),
      isActive: () => this.isBlockType('p')
    });

    this.register('blockquote', {
      execute: () => this.formatBlock('blockquote'),
      isActive: () => this.isBlockType('blockquote')
    });

    this.register('pre', {
      execute: () => this.formatBlock('pre'),
      isActive: () => this.isBlockType('pre')
    });

    // Lists
    this.register('insertOrderedList', {
      execute: () => this.execNative('insertOrderedList'),
      isActive: () => document.queryCommandState('insertOrderedList'),
      shortcut: 'Ctrl+Shift+O'
    });

    this.register('insertUnorderedList', {
      execute: () => this.execNative('insertUnorderedList'),
      isActive: () => document.queryCommandState('insertUnorderedList'),
      shortcut: 'Ctrl+Shift+L'
    });

    // Alignment
    this.register('justifyLeft', {
      execute: () => this.execNative('justifyLeft'),
      isActive: () => document.queryCommandState('justifyLeft')
    });

    this.register('justifyCenter', {
      execute: () => this.execNative('justifyCenter'),
      isActive: () => document.queryCommandState('justifyCenter')
    });

    this.register('justifyRight', {
      execute: () => this.execNative('justifyRight'),
      isActive: () => document.queryCommandState('justifyRight')
    });

    this.register('justifyFull', {
      execute: () => this.execNative('justifyFull'),
      isActive: () => document.queryCommandState('justifyFull')
    });

    // Indentation
    this.register('indent', {
      execute: () => this.execNative('indent'),
      shortcut: 'Tab'
    });

    this.register('outdent', {
      execute: () => this.execNative('outdent'),
      shortcut: 'Shift+Tab'
    });

    // Insert commands
    this.register('insertHorizontalRule', {
      execute: () => this.execNative('insertHorizontalRule')
    });

    this.register('createLink', {
      execute: (url) => {
        if (url) {
          this.execNative('createLink', url);
        }
      },
      shortcut: 'Ctrl+K'
    });

    this.register('unlink', {
      execute: () => this.execNative('unlink')
    });

    this.register('insertImage', {
      execute: (url) => {
        if (url) {
          this.execNative('insertImage', url);
        }
      }
    });

    this.register('insertHTML', {
      execute: (html) => {
        if (html) {
          this.editor.selection?.insertHtml(html);
        }
      }
    });

    this.register('insertText', {
      execute: (text) => {
        if (text) {
          this.editor.selection?.insertText(text);
        }
      }
    });

    // Color commands
    this.register('foreColor', {
      execute: (color) => this.execNative('foreColor', color),
      getValue: () => document.queryCommandValue('foreColor')
    });

    this.register('backColor', {
      execute: (color) => this.execNative('backColor', color),
      getValue: () => document.queryCommandValue('backColor')
    });

    // Utility commands
    this.register('removeFormat', {
      execute: () => this.execNative('removeFormat')
    });

    this.register('selectAll', {
      execute: () => this.editor.selection?.selectAll(),
      shortcut: 'Ctrl+A'
    });

    this.register('undo', {
      execute: () => this.editor.history?.undo(),
      canExecute: () => this.editor.history?.canUndo() || false,
      shortcut: 'Ctrl+Z'
    });

    this.register('redo', {
      execute: () => this.editor.history?.redo(),
      canExecute: () => this.editor.history?.canRedo() || false,
      shortcut: 'Ctrl+Y'
    });
  }

  /**
   * Register a command
   * @param {string} name - Command name
   * @param {Object} command - Command definition
   */
  register(name, command) {
    this.commands.set(name, {
      execute: command.execute,
      isActive: command.isActive || (() => false),
      canExecute: command.canExecute || (() => true),
      getValue: command.getValue || (() => null),
      shortcut: command.shortcut || null
    });
  }

  /**
   * Unregister a command
   * @param {string} name - Command name
   */
  unregister(name) {
    this.commands.delete(name);
  }

  /**
   * Execute a command
   * @param {string} name - Command name
   * @param {...any} args - Command arguments
   * @returns {boolean} Success
   */
  execute(name, ...args) {
    const command = this.commands.get(name);
    if (!command) {
      console.warn(`Command "${name}" not found`);
      return false;
    }

    // Check if command can execute
    if (!command.canExecute(...args)) {
      return false;
    }

    // Emit before execute event
    this.editor.events?.emit(EventBus.Events.COMMAND_BEFORE_EXECUTE, {name, args});

    // Ensure editor is focused
    if (!this.editor.contentArea?.hasFocus()) {
      this.editor.selection?.focus();
    }

    // Save selection before command
    this.editor.selection?.saveSelection();

    try {
      // Execute command
      command.execute(...args);

      // Record history
      this.editor.history?.record();

      // Emit execute event
      this.editor.events?.emit(EventBus.Events.COMMAND_EXECUTE, {name, args});

      // Update toolbar state
      this.editor.events?.emit(EventBus.Events.TOOLBAR_UPDATE);

      return true;
    } catch (error) {
      console.error(`Error executing command "${name}":`, error);
      return false;
    }
  }

  /**
   * Execute native document.execCommand
   * @param {string} command - Command name
   * @param {string} value - Command value
   * @returns {boolean}
   */
  execNative(command, value = null) {
    try {
      return document.execCommand(command, false, value);
    } catch (e) {
      console.warn(`Native command "${command}" failed:`, e);
      return false;
    }
  }

  /**
   * Format block element
   * @param {string} tagName - Tag name
   */
  formatBlock(tagName) {
    const normalized = tagName.toLowerCase();

    // Check if already in this block type
    if (this.isBlockType(normalized)) {
      // Convert back to paragraph
      this.execNative('formatBlock', '<p>');
    } else {
      this.execNative('formatBlock', `<${normalized}>`);
    }
  }

  /**
   * Check if current selection is in block type
   * @param {string} tagName - Tag name
   * @returns {boolean}
   */
  isBlockType(tagName) {
    const block = this.editor.selection?.getParentBlock();
    return block && block.tagName.toLowerCase() === tagName.toLowerCase();
  }

  /**
   * Check if command is active
   * @param {string} name - Command name
   * @param {...any} args - Command arguments
   * @returns {boolean}
   */
  isActive(name, ...args) {
    const command = this.commands.get(name);
    if (!command || typeof command.isActive !== 'function') {
      return false;
    }

    try {
      return command.isActive(...args);
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if command can execute
   * @param {string} name - Command name
   * @param {...any} args - Command arguments
   * @returns {boolean}
   */
  canExecute(name, ...args) {
    const command = this.commands.get(name);
    if (!command) return false;

    try {
      return command.canExecute(...args);
    } catch (e) {
      return false;
    }
  }

  /**
   * Get command value
   * @param {string} name - Command name
   * @returns {*}
   */
  getValue(name) {
    const command = this.commands.get(name);
    if (!command || typeof command.getValue !== 'function') {
      return null;
    }

    try {
      return command.getValue();
    } catch (e) {
      return null;
    }
  }

  /**
   * Get command shortcut
   * @param {string} name - Command name
   * @returns {string|null}
   */
  getShortcut(name) {
    const command = this.commands.get(name);
    return command?.shortcut || null;
  }

  /**
   * Get all command names
   * @returns {string[]}
   */
  getCommandNames() {
    return Array.from(this.commands.keys());
  }

  /**
   * Check if command exists
   * @param {string} name - Command name
   * @returns {boolean}
   */
  hasCommand(name) {
    return this.commands.has(name);
  }

  /**
   * Get current formatting state
   * @returns {Object}
   */
  getFormattingState() {
    return {
      bold: this.isActive('bold'),
      italic: this.isActive('italic'),
      underline: this.isActive('underline'),
      strikethrough: this.isActive('strikethrough'),
      orderedList: this.isActive('insertOrderedList'),
      unorderedList: this.isActive('insertUnorderedList'),
      justifyLeft: this.isActive('justifyLeft'),
      justifyCenter: this.isActive('justifyCenter'),
      justifyRight: this.isActive('justifyRight'),
      justifyFull: this.isActive('justifyFull'),
      foreColor: this.getValue('foreColor'),
      backColor: this.getValue('backColor')
    };
  }

  /**
   * Destroy command manager
   */
  destroy() {
    this.commands.clear();
  }
}

export default CommandManager;
