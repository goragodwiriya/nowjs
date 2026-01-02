/**
 * AnimationManager Demo - JavaScript
 * Interactive examples for AnimationManager
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

      theme: {
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

    // Create application instance
    const app = await Now.createApp({
      name: 'Now.js',
      version: '1.0.0'
    });

    // Initialize animation examples
    initializeAnimationExamples();

  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});

// ============================================
// Initialize All Animation Examples
// ============================================

function initializeAnimationExamples() {
  // ============================================
  // Note: Example 1 (data-animate) and Example 3 (data-enter)
  // are now handled automatically by AnimationManager.autoInit()
  // enabled via data-animation-auto on <body>
  // ============================================

  // ============================================
  // Example 2: Show/Hide Panel (requires custom state management)
  // ============================================
  let isVisible = true;
  const panel = document.getElementById('animatedPanel');
  const toggleBtn = document.getElementById('togglePanel');
  const animationSelect = document.getElementById('showAnimation');

  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', () => {
      isVisible = !isVisible;
      const animation = animationSelect?.value || 'fade';

      if (AnimationManager) {
        AnimationManager.stop(panel);

        if (isVisible) {
          panel.style.display = '';
          AnimationManager.animate(panel, animation, {
            direction: 'in',
            duration: 300
          });
        } else {
          AnimationManager.animate(panel, animation, {
            direction: 'out',
            duration: 300,
            onComplete: () => {
              panel.style.display = 'none';
            }
          });
        }
      }
    });
  }

  // ============================================
  // Example 4: Stagger Animation
  // ============================================
  const staggerBtn = document.getElementById('staggerList');
  const resetBtn = document.getElementById('resetList');
  const staggerDelayInput = document.getElementById('staggerDelay');
  const delayValueSpan = document.getElementById('delayValue');

  if (staggerDelayInput && delayValueSpan) {
    staggerDelayInput.addEventListener('input', (e) => {
      delayValueSpan.textContent = e.target.value + 'ms';
    });
  }

  if (staggerBtn) {
    staggerBtn.addEventListener('click', () => {
      const items = document.querySelectorAll('.stagger-item');
      const delay = staggerDelayInput ? parseInt(staggerDelayInput.value) : 100;

      // Reset first
      items.forEach(item => {
        item.style.opacity = '0';
        item.style.transform = 'translateX(-20px)';
      });

      // Small delay to ensure reset is visible
      setTimeout(() => {
        if (AnimationManager && AnimationManager.stagger) {
          AnimationManager.stagger(items, 'slideRight', {
            stagger: delay,
            duration: 400
          });
        }
      }, 50);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const items = document.querySelectorAll('.stagger-item');
      items.forEach(item => {
        item.style.opacity = '1';
        item.style.transform = 'translateX(0)';
      });
    });
  }

  // ============================================
  // Example 5: Parallel Animations
  // ============================================
  const parallelBtn = document.getElementById('parallelAnimate');
  if (parallelBtn) {
    parallelBtn.addEventListener('click', () => {
      const box = document.getElementById('parallelBox');
      if (box && AnimationManager && AnimationManager.parallel) {
        AnimationManager.parallel(box, ['scale', 'rotate'], {
          duration: 800
        });
      }
    });
  }

  // ============================================
  // Example 6: Animation Chain
  // ============================================
  const chainBtn = document.getElementById('chainAnimate');
  if (chainBtn) {
    chainBtn.addEventListener('click', async () => {
      const box = document.getElementById('chainBox');
      if (box && AnimationManager && AnimationManager.chain) {
        chainBtn.disabled = true;
        chainBtn.textContent = 'Running...';

        await AnimationManager.chain(box, [
          {name: 'slideUp', options: {duration: 400}},
          {name: 'shake', options: {duration: 500}},
          {name: 'scale', options: {duration: 300}},
          {name: 'pulse', options: {duration: 400, iterations: 2}}
        ]);

        chainBtn.disabled = false;
        chainBtn.textContent = 'Run Chain';
      }
    });
  }

  // ============================================
  // Example 7: Pause/Resume Controls
  // ============================================
  const controlBox = document.getElementById('controlBox');
  const startBtn = document.getElementById('startLong');
  const pauseBtn = document.getElementById('pauseBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const stopBtn = document.getElementById('stopBtn');

  if (startBtn && controlBox) {
    startBtn.addEventListener('click', () => {
      if (AnimationManager) {
        AnimationManager.animate(controlBox, 'rotate', {
          duration: 3000,
          iterations: Infinity
        });
      }
    });
  }

  if (pauseBtn && controlBox) {
    pauseBtn.addEventListener('click', () => {
      if (AnimationManager && AnimationManager.pause) {
        AnimationManager.pause(controlBox);
      }
    });
  }

  if (resumeBtn && controlBox) {
    resumeBtn.addEventListener('click', () => {
      if (AnimationManager && AnimationManager.resume) {
        AnimationManager.resume(controlBox);
      }
    });
  }

  if (stopBtn && controlBox) {
    stopBtn.addEventListener('click', () => {
      if (AnimationManager) {
        AnimationManager.stop(controlBox);
      }
    });
  }

  // ============================================
  // Example 8: Animation Queue
  // ============================================
  const queueBox = document.getElementById('queueBox');
  const queueCountSpan = document.getElementById('queueCount');
  let queueCount = 0;

  function updateQueueCount() {
    if (queueCountSpan) {
      queueCountSpan.textContent = queueCount;
    }
  }

  const addBounceBtn = document.getElementById('addBounce');
  const addShakeBtn = document.getElementById('addShake');
  const addFlipBtn = document.getElementById('addFlip');
  const clearQueueBtn = document.getElementById('clearQueue');

  if (addBounceBtn && queueBox) {
    addBounceBtn.addEventListener('click', () => {
      if (AnimationManager && AnimationManager.queue) {
        queueCount++;
        updateQueueCount();

        AnimationManager.queue(queueBox, 'bounce', {duration: 500})
          .then(() => {
            queueCount--;
            updateQueueCount();
          })
          .catch(() => {
            queueCount--;
            updateQueueCount();
          });
      }
    });
  }

  if (addShakeBtn && queueBox) {
    addShakeBtn.addEventListener('click', () => {
      if (AnimationManager && AnimationManager.queue) {
        queueCount++;
        updateQueueCount();

        AnimationManager.queue(queueBox, 'shake', {duration: 600})
          .then(() => {
            queueCount--;
            updateQueueCount();
          })
          .catch(() => {
            queueCount--;
            updateQueueCount();
          });
      }
    });
  }

  if (addFlipBtn && queueBox) {
    addFlipBtn.addEventListener('click', () => {
      if (AnimationManager && AnimationManager.queue) {
        queueCount++;
        updateQueueCount();

        AnimationManager.queue(queueBox, 'flip', {duration: 700})
          .then(() => {
            queueCount--;
            updateQueueCount();
          })
          .catch(() => {
            queueCount--;
            updateQueueCount();
          });
      }
    });
  }

  if (clearQueueBtn && queueBox) {
    clearQueueBtn.addEventListener('click', () => {
      if (AnimationManager && AnimationManager.clearQueue) {
        AnimationManager.clearQueue(queueBox);
        queueCount = 0;
        updateQueueCount();
      }
    });
  }

  // ============================================
  // Example 9: Easing Presets
  // ============================================
  const testEasingBtn = document.getElementById('testEasing');
  const easingSelect = document.getElementById('easingSelect');
  const easingBall = document.getElementById('easingBall');

  if (testEasingBtn && easingBall) {
    testEasingBtn.addEventListener('click', () => {
      const easing = easingSelect?.value || 'ease';

      // Reset position
      easingBall.style.transform = 'translateX(0)';

      if (AnimationManager) {
        AnimationManager.animate(easingBall, {
          from: {transform: 'translateX(0)'},
          to: {transform: 'translateX(400px)'}
        }, {
          duration: 1000,
          easing: easing
        });
      }
    });
  }

  // ============================================
  // Example 10: Custom Animation
  // ============================================
  const customBox = document.getElementById('customBox');
  const customAnimateBtn = document.getElementById('customAnimate');
  const registerCustomBtn = document.getElementById('registerCustom');
  const useRegisteredBtn = document.getElementById('useRegistered');

  if (customAnimateBtn && customBox) {
    customAnimateBtn.addEventListener('click', () => {
      if (AnimationManager) {
        AnimationManager.animate(customBox, {
          from: {
            transform: 'rotate(0) scale(1)',
            backgroundColor: '#3498db',
            borderRadius: '0'
          },
          steps: [
            {
              transform: 'rotate(180deg) scale(1.2)',
              backgroundColor: '#e74c3c',
              borderRadius: '50%',
              offset: 0.5
            }
          ],
          to: {
            transform: 'rotate(360deg) scale(1)',
            backgroundColor: '#2ecc71',
            borderRadius: '0'
          }
        }, {
          duration: 1500
        });
      }
    });
  }

  if (registerCustomBtn) {
    registerCustomBtn.addEventListener('click', () => {
      if (AnimationManager && AnimationManager.registerAnimation) {
        AnimationManager.registerAnimation('myCustomAnim', {
          in: {
            from: {transform: 'translateY(-100%) rotate(-45deg)', opacity: 0},
            to: {transform: 'translateY(0) rotate(0)', opacity: 1}
          },
          out: {
            from: {transform: 'translateY(0) rotate(0)', opacity: 1},
            to: {transform: 'translateY(100%) rotate(45deg)', opacity: 0}
          }
        });

        alert('Custom animation "myCustomAnim" registered!');
      }
    });
  }

  if (useRegisteredBtn && customBox) {
    useRegisteredBtn.addEventListener('click', () => {
      if (AnimationManager) {
        AnimationManager.animate(customBox, 'myCustomAnim', {
          direction: 'in',
          duration: 600
        });
      }
    });
  }

  // ============================================
  // Animation Gallery - Hover Preview
  // ============================================
  document.querySelectorAll('.gallery-item').forEach(item => {
    const anim = item.dataset.anim;
    const box = item.querySelector('.gallery-box');

    if (anim && box) {
      item.addEventListener('mouseenter', () => {
        if (AnimationManager) {
          AnimationManager.animate(box, anim, {
            duration: 600
          });
        }
      });

      item.addEventListener('click', () => {
        if (AnimationManager) {
          AnimationManager.animate(box, anim, {
            duration: 600
          });
        }
      });
    }
  });

  console.log('AnimationManager examples initialized');
}
