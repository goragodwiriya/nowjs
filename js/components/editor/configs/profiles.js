/**
 * RichTextEditor - Config Profiles
 * Pre-defined configurations for common use cases
 *
 * @author Goragod Wiriya
 * @version 1.0
 */

/**
 * Full profile - All features enabled
 */
export const full = {
  name: 'full',
  plugins: [
    'link', 'image', 'table', 'video',
    'emoji', 'specialChars',
    'sourceView', 'fullscreen', 'findReplace',
    'autosave', 'wordcount', 'maxLength', 'mention'
  ],
  toolbar: [
    ['bold', 'italic', 'underline', 'strikethrough'],
    ['heading'],
    ['bulletList', 'numberedList'],
    ['alignLeft', 'alignCenter', 'alignRight', 'alignJustify'],
    ['indent', 'outdent'],
    ['link', 'image', 'video', 'table'],
    ['blockquote', 'codeBlock', 'horizontalRule'],
    ['textColor', 'backgroundColor'],
    ['emoji', 'specialChars'],
    ['undo', 'redo'],
    ['removeFormat', 'findReplace', 'sourceView', 'fullscreen']
  ],
  options: {
    minHeight: 300,
    autosave: {
      interval: 30000,
      useLocalStorage: true
    },
    maxLength: {
      maxLength: 50000,
      showCounter: true
    },
    wordcount: {
      showWords: true,
      showCharacters: true
    }
  }
};

/**
 * Basic profile - Common features for general use
 */
export const basic = {
  name: 'basic',
  plugins: [
    'link', 'image', 'table',
    'sourceView', 'wordcount'
  ],
  toolbar: [
    ['bold', 'italic', 'underline'],
    ['heading'],
    ['bulletList', 'numberedList'],
    ['alignLeft', 'alignCenter', 'alignRight'],
    ['link', 'image', 'table'],
    ['textColor', 'backgroundColor'],
    ['undo', 'redo'],
    ['removeFormat', 'sourceView']
  ],
  options: {
    minHeight: 250,
    wordcount: {
      showWords: true,
      showCharacters: false
    }
  }
};

/**
 * Minimal profile - Text formatting only
 */
export const minimal = {
  name: 'minimal',
  plugins: [],
  toolbar: [
    ['bold', 'italic', 'underline'],
    ['bulletList', 'numberedList'],
    ['undo', 'redo'],
    ['removeFormat']
  ],
  options: {
    minHeight: 150
  }
};

/**
 * Comment profile - For short comments/replies
 */
export const comment = {
  name: 'comment',
  plugins: ['link', 'emoji'],
  toolbar: [
    ['bold', 'italic'],
    ['link', 'emoji'],
    ['undo', 'redo']
  ],
  options: {
    minHeight: 100,
    maxLength: {
      maxLength: 2000,
      showCounter: true
    }
  }
};

/**
 * Email profile - For composing emails
 */
export const email = {
  name: 'email',
  plugins: ['link', 'image', 'autosave'],
  toolbar: [
    ['bold', 'italic', 'underline'],
    ['bulletList', 'numberedList'],
    ['alignLeft', 'alignCenter', 'alignRight'],
    ['link', 'image'],
    ['textColor'],
    ['undo', 'redo']
  ],
  options: {
    minHeight: 300,
    autosave: {
      interval: 10000,
      useLocalStorage: true
    }
  }
};

/**
 * All available profiles
 */
export const profiles = {
  full,
  basic,
  minimal,
  comment,
  email
};

export default profiles;
