/**
 * DialogManager Example Main Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize framework
    await Now.init({
      environment: 'production',
      i18n: {
        enabled: true,
        availableLocales: ['en', 'th']
      },
      config: {
        enabled: true
      },
      syntaxhighlighter: {
        display: {
          lineNumbers: true,
          copyButton: true
        }
      }
    }).then(() => {
      // Load application components
      const scripts = [
        '../header.js',
        '../../js/components/footer.js',
        '../../js/components/SyntaxHighlighterComponent.js'
      ];

      scripts.forEach(src => {
        const script = document.createElement('script');
        script.src = src;
        document.head.appendChild(script);
      });
    });

    // Create App
    await Now.createApp({
      name: 'Now.js',
      version: '1.0.0'
    });

    // Initialize DialogManager
    await DialogManager.init({
      animation: true,
      duration: 200,
      draggable: true,
      closeOnEscape: true,
      closeOnBackdrop: true,
      preventScroll: true
    });

    // --- Example 1: Alert Dialogs ---

    // Basic Alert
    document.getElementById('btn-alert-basic')?.addEventListener('click', async () => {
      await DialogManager.alert('This is a basic alert message', 'Alert');
      console.log('User clicked OK');
    });

    // Success Alert
    document.getElementById('btn-alert-success')?.addEventListener('click', async () => {
      await DialogManager.alert(
        'Operation completed successfully!',
        'Success',
        {customClass: 'dialog-success'}
      );
    });

    // Error Alert
    document.getElementById('btn-alert-error')?.addEventListener('click', async () => {
      await DialogManager.alert(
        'An error occurred. Please try again.',
        'Error',
        {customClass: 'dialog-error'}
      );
    });

    // --- Example 2: Confirm Dialogs ---

    // Basic Confirm
    document.getElementById('btn-confirm-basic')?.addEventListener('click', async () => {
      const confirmed = await DialogManager.confirm(
        'Are you sure you want to proceed with this action?',
        'Confirm Action'
      );

      if (confirmed) {
        alert('You clicked Confirm!');
      } else {
        alert('You clicked Cancel');
      }
    });

    // Delete Confirmation
    document.getElementById('btn-confirm-delete')?.addEventListener('click', async () => {
      const deleteConfirmed = await DialogManager.confirm(
        'This action cannot be undone. Are you sure you want to delete?',
        'Delete Item',
        {customClass: 'dialog-danger'}
      );

      if (deleteConfirmed) {
        alert('Item deleted!');
      }
    });

    // Unsaved Changes
    document.getElementById('btn-confirm-unsaved')?.addEventListener('click', async () => {
      const saveConfirm = await DialogManager.confirm(
        'You have unsaved changes. Do you want to save before leaving?',
        'Unsaved Changes'
      );

      if (saveConfirm) {
        alert('Changes saved!');
      } else {
        alert('Changes discarded');
      }
    });

    // --- Example 3: Prompt Dialogs ---

    // Ask Name
    document.getElementById('btn-prompt-name')?.addEventListener('click', async () => {
      const name = await DialogManager.prompt(
        'Please enter your name:',
        'Guest',
        'Welcome'
      );

      if (name !== null) {
        alert(`Hello, ${name}!`);
      }
    });

    // Ask Email
    document.getElementById('btn-prompt-email')?.addEventListener('click', async () => {
      const email = await DialogManager.prompt(
        'Enter your email address:',
        '',
        'Email Subscription'
      );

      if (email !== null && email.trim() !== '') {
        alert(`Email registered: ${email}`);
      }
    });

    // Custom Prompt
    document.getElementById('btn-prompt-custom')?.addEventListener('click', async () => {
      const age = await DialogManager.prompt(
        'Please enter your age (18+):',
        '18',
        'Age Verification'
      );

      if (age !== null) {
        const ageNum = parseInt(age);
        if (ageNum >= 18) {
          alert('Access granted!');
        } else {
          alert('You must be 18 or older');
        }
      }
    });

    // --- Example 4: Custom Dialogs ---

    // HTML Content Dialog
    document.getElementById('btn-custom-html')?.addEventListener('click', () => {
      DialogManager.custom({
        title: 'Rich HTML Content',
        message: `
          <div class="custom-content">
            <h3>Welcome to DialogManager!</h3>
            <p>This dialog supports <strong>HTML</strong> content with rich formatting.</p>
            <ul>
              <li>✓ Bullet points</li>
              <li>✓ Formatted text</li>
              <li>✓ Custom styling</li>
              <li>✓ And much more!</li>
            </ul>
            <div class="alert alert-info">
              <strong>Tip:</strong> You can include any HTML elements here!
            </div>
          </div>
        `,
        customClass: 'dialog-rich-content',
        buttons: {
          close: {
            text: 'Got it!',
            class: 'btn-primary'
          }
        }
      });
    });

    // Form Dialog
    document.getElementById('btn-custom-form')?.addEventListener('click', () => {
      const formDialog = DialogManager.custom({
        title: 'User Information',
        message: `
          <form id="user-form" style="text-align: left;">
            <div class="form-group" style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem;">Name *</label>
              <input type="text" name="name" class="form-control" required style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem;">Email *</label>
              <input type="email" name="email" class="form-control" required style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem;">Message</label>
              <textarea name="message" class="form-control" rows="3" style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;"></textarea>
            </div>
          </form>
        `,
        buttons: {
          cancel: {
            text: 'Cancel',
            class: 'text'
          },
          submit: {
            text: 'Submit',
            class: 'btn-primary',
            callback: (dialog) => {
              const form = dialog.querySelector('#user-form');
              if (form.checkValidity()) {
                const data = new FormData(form);
                const formData = Object.fromEntries(data);
                console.log('Form submitted:', formData);
                alert('Form submitted! Check console for data.');
              } else {
                form.reportValidity();
              }
            }
          }
        }
      });
    });

    // Loading Dialog
    document.getElementById('btn-custom-loading')?.addEventListener('click', () => {
      const loadingDialog = DialogManager.custom({
        title: 'Loading...',
        message: `
          <div class="loading-content" style="text-align: center; padding: 2rem;">
            <div class="spinner" style="margin: 0 auto 1rem;"></div>
            <p>Please wait while we process your request...</p>
          </div>
        `,
        customClass: 'dialog-loading',
        buttons: {}  // No buttons
      });

      // Auto close after 3 seconds
      setTimeout(() => {
        DialogManager.close(loadingDialog);
        DialogManager.alert('Operation completed!', 'Success', {
          customClass: 'dialog-success'
        });
      }, 3000);
    });

    // --- Example 5: Multiple Dialogs ---

    // Stack Dialogs
    document.getElementById('btn-multi-stack')?.addEventListener('click', () => {
      DialogManager.alert('This is the first dialog', 'Dialog 1');

      setTimeout(() => {
        DialogManager.alert('This is the second dialog on top', 'Dialog 2');
      }, 500);

      setTimeout(() => {
        DialogManager.alert('This is the third dialog!', 'Dialog 3');
      }, 1000);
    });

    // Cascade Dialogs
    document.getElementById('btn-multi-cascade')?.addEventListener('click', async () => {
      const first = await DialogManager.confirm('Would you like to continue?', 'Step 1');

      if (first) {
        const second = await DialogManager.prompt('Enter your name:', '', 'Step 2');

        if (second) {
          await DialogManager.alert(`Welcome, ${second}!`, 'Step 3');
        }
      }
    });

    // Close All
    document.getElementById('btn-close-all')?.addEventListener('click', () => {
      DialogManager.closeAll();
    });

    // --- Example 6: Features Demo ---

    // Draggable Dialog
    document.getElementById('btn-draggable')?.addEventListener('click', () => {
      DialogManager.custom({
        title: 'Drag Me!',
        message: '<p>Try dragging this dialog by clicking and holding the header, then move your mouse.</p><p>The dialog will stay within the window boundaries.</p>',
        draggable: true,
        buttons: {
          close: {
            text: 'Close',
            class: 'btn-primary'
          }
        }
      });
    });

    // No Backdrop Click
    document.getElementById('btn-no-backdrop')?.addEventListener('click', () => {
      DialogManager.custom({
        title: 'Important Notice',
        message: '<p>You cannot close this dialog by clicking the backdrop.</p><p>You must use the button or ESC key.</p>',
        buttons: {
          close: {
            text: 'I Understand',
            class: 'btn-primary'
          }
        }
      });
    });

    // Custom Styling
    document.getElementById('btn-custom-class')?.addEventListener('click', () => {
      DialogManager.alert(
        'This dialog has custom CSS styling applied via customClass option',
        'Styled Dialog',
        {customClass: 'my-custom-dialog rainbow-border'}
      );
    });

    // --- Example 7: Events ---

    document.getElementById('btn-events')?.addEventListener('click', () => {
      const dialog = DialogManager.custom({
        title: 'Event Demo',
        message: '<p>This dialog logs events to the console.</p><p>Open your browser console to see the logs!</p>',
        onShow: (event) => {
          console.log('✅ Dialog shown event fired');
          console.log('Dialog element:', event.detail.dialog);
        },
        onClose: (event) => {
          console.log('❌ Dialog closed event fired');
          console.log('Dialog element:', event.detail.dialog);
        },
        buttons: {
          action: {
            text: 'Trigger Action',
            class: 'btn-secondary',
            callback: (dialog) => {
              console.log('⚡ Action button clicked!');
              alert('Action triggered! Check console.');
            }
          },
          close: {
            text: 'Close',
            class: 'btn-primary'
          }
        }
      });

      // Additional event listeners
      dialog.addEventListener('dialog:shown', () => {
        console.log('📢 addEventListener: dialog:shown');
      });

      dialog.addEventListener('dialog:closed', () => {
        console.log('📢 addEventListener: dialog:closed');
      });
    });

  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});
