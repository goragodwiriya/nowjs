# Sortable Examples

This folder contains interactive examples demonstrating the Sortable component functionality.

## 📋 Examples Overview

### Example 1: Basic Sortable List
Simple drag and drop list with fruits. Shows the most basic usage of Sortable.

**Features:**
- Drag entire item to reorder
- Visual feedback with ghost element
- Smooth animations

**Code:**
```html
<ul data-component="sortable" class="simple-list">
  <li draggable="true" data-id="1">🍎 Apple</li>
  <li draggable="true" data-id="2">🍌 Banana</li>
  <li draggable="true" data-id="3">🍊 Orange</li>
</ul>
```

### Example 2: Drag Handle
Shows how to use a drag handle instead of dragging the entire item. This is useful when items contain interactive elements like buttons.

**Features:**
- Drag only from handle (⋮⋮)
- Prevents accidental dragging
- Perfect for cards with buttons

**Code:**
```html
<div data-component="sortable" data-handle=".drag-handle">
  <div class="card" draggable="true" data-id="1">
    <span class="drag-handle">⋮⋮</span>
    <div class="card-content">
      <h3>Task 1</h3>
      <button>Edit</button>
    </div>
  </div>
</div>
```

### Example 3: Kanban Board
Demonstrates cross-container dragging with groups. Items can be dragged between different columns.

**Features:**
- Multi-column layout
- Drag cards between columns
- Group-based container sharing
- Category tracking

**Code:**
```html
<div class="kanban-column"
     data-component="sortable"
     data-group="kanban"
     data-category="todo">
  <h3>To Do</h3>
  <div class="kanban-card" draggable="true" data-id="1">
    <h4>Task Title</h4>
  </div>
</div>
```

### Example 4: Priority List
Shows keyboard accessibility support and visual priority indicators.

**Features:**
- Keyboard navigation (Arrow keys)
- Space bar for selection
- Priority badges (HIGH, MEDIUM, LOW)
- Focus management

**Keyboard Shortcuts:**
- `↑/↓` - Move item up/down
- `Space` - Select/deselect item

### Example 5: File Reordering
Integration with FileElementFactory for drag-and-drop file ordering.

**Features:**
- Upload files
- Drag to reorder uploaded files
- File preview with thumbnails
- Integration with form submission

**Code:**
```html
<input type="file"
       data-element="file"
       data-preview="true"
       data-sortable="true"
       data-file-reference="id"
       multiple>
```

### Example 6: Event Logging
Real-time event monitoring to understand Sortable lifecycle.

**Events:**
- `sortable:start` - When drag begins
- `sortable:end` - When drag ends
- `sortable:change` - When position changes
- `sortable:select` - When item is selected
- `sortable:api-success` - API save succeeded
- `sortable:api-error` - API save failed

**Code:**
```javascript
container.addEventListener('sortable:end', (e) => {
  console.log('Moved from', e.detail.oldIndex, 'to', e.detail.newIndex);
});
```

## 🚀 Running the Examples

1. Make sure Now.js framework is properly installed
2. Open `index.html` in a web browser
3. Or use a local server:
   ```bash
   cd /path/to/Now
   python3 -m http.server 8000
   # Open http://localhost:8000/examples/sortable/
   ```

## 📚 Key Concepts

### 1. Drag Modes

**Full Area Drag (Default):**
- Drag from anywhere on the item
- Simple and intuitive
- Best for simple lists

**Drag Handle:**
- Drag only from specific element
- Prevents accidental drags
- Use `data-handle=".handle-class"`

### 2. Cross-Container Dragging

Enable with `data-group` attribute:
```html
<div data-component="sortable" data-group="shared">...</div>
<div data-component="sortable" data-group="shared">...</div>
```

All containers with same group name can exchange items.

### 3. API Integration

Auto-save changes to server:
```html
<div data-component="sortable"
     data-sortable-api="/api/items/update"
     data-sortable-method="PUT"
     data-sortable-id-attr="data-id"
     data-sortable-stage-attr="data-category"
     data-sortable-update-field="category">
```

### 4. FileElementFactory Integration

Sortable automatically works with FileElementFactory when `data-sortable="true"`:
```html
<input type="file"
       data-element="file"
       data-sortable="true"
       multiple>
```

## 🎨 Styling

Default CSS classes:

- `.sortable-ghost` - Ghost element while dragging
- `.sortable-drag` - Element being dragged
- `.sortable-chosen` - Selected element

Customize in your CSS:
```css
.sortable-ghost {
  opacity: 0.4;
  background: #e3f2fd;
}

.sortable-drag {
  opacity: 0.8;
  transform: rotate(2deg);
}
```

## 📖 Documentation

For complete API documentation, see:
- `/docs/en/Sortable.md` - Full English documentation
- `/docs/th/Sortable.md` - Thai documentation

## 🔧 Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `draggable` | string | `'[draggable="true"]'` | Selector for draggable items |
| `handle` | string | `null` | Selector for drag handle |
| `animation` | number | `150` | Animation duration (ms) |
| `group` | string | `null` | Group name for cross-container |
| `apiEndpoint` | string | - | API endpoint for auto-save |

## 💡 Tips

1. **Performance**: For large lists (>1000 items), consider virtual scrolling
2. **Touch Support**: Works on mobile devices automatically
3. **Accessibility**: Always provide keyboard navigation
4. **Visual Feedback**: Use CSS transitions for smooth animations
5. **Error Handling**: Listen to `sortable:api-error` for API failures

## 🐛 Troubleshooting

**Items won't drag:**
- Check `draggable="true"` attribute
- Verify Sortable.js is loaded
- Check browser console for errors

**Handle not working:**
- Ensure `data-handle` selector matches element
- Check CSS `cursor: move` on handle

**Cross-container not working:**
- All containers must have same `data-group`
- Containers must be siblings or in same parent

**API not saving:**
- Check `data-sortable-api` endpoint URL
- Verify `data-id` on items
- Check network tab for API errors

## 📝 License

Part of Now.js Framework - See main LICENSE file
