/**
 * Social Feed Example
 * Demonstrates Now.js declarative patterns with minimal JavaScript
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Detect current directory path
    const currentPath = window.location.pathname;
    const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);

    // Initialize Now.js framework - minimal config
    await Now.init({
      environment: 'production'
    });

    // Load application components
    const scripts = [
      '../header.js',
      '../../js/components/footer.js'
    ];

    scripts.forEach(src => {
      const script = document.createElement('script');
      script.src = src;
      document.head.appendChild(script);
    });

    // Create application instance first
    const app = await Now.createApp({
      name: 'Social Feed Demo',
      version: '1.0.0'
    });

    // Define Feed Component AFTER app is created
    defineFeedComponent();

  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});

/**
 * Define the Feed Component
 */
function defineFeedComponent() {
  const componentManager = Now.getManager('component');
  if (!componentManager) {
    console.error('ComponentManager not available');
    return;
  }

  componentManager.define('feed', {
    reactive: true,

    state: {
      posts: [],
      users: {},
      newPost: {
        content: '',
        media: []
      },
      page: 1,
      hasMore: true,
      isLoading: false,
      totalLikes: 0
    },

    computed: {
      totalLikes() {
        return this.state.posts.reduce((sum, post) => sum + post.likes, 0);
      }
    },

    watch: {
      'posts': function(newVal, oldVal) {
        // Only update if posts actually changed
        if (!newVal || newVal.length === oldVal?.length) {
          return;
        }

        // Trigger the data-for update callback that was set up by TemplateManager
        if (this.element) {
          const forElement = this.element.querySelector('[data-for*="posts"]');
          if (forElement) {
            if (forElement._reactiveUpdate) {
              forElement._reactiveUpdate();
            } else {
              // Fallback: force re-process data-for
              const templateManager = Now.getManager('template');
              if (templateManager) {
                const forValue = forElement.getAttribute('data-for');
                templateManager.processDataFor(forElement, forValue, this);
              }
            }
          }
        }
      }
    },

    methods: {
      async loadPosts() {
        if (this.state.isLoading) return;
        this.state.isLoading = true;

        try {
          // Use PHP API for infinite scroll demo
          const baseUrl = window.location.href.replace(/\/[^/]*$/, '/');
          const url = `${baseUrl}api/posts.php?page=${this.state.page}&limit=5`;
          const response = await fetch(url);

          if (!response.ok) {
            this.state.hasMore = false;
            return;
          }

          const result = await response.json();

          if (!result.success) {
            this.state.hasMore = false;
            return;
          }

          const enrichedPosts = result.data.map(post => {
            // Convert single image to media array for template compatibility
            const media = post.image ? [{type: 'image', url: post.image}] : [];
            return {
              ...post,
              media,
              mediaGridClass: this.methods.getMediaGridClass(media.length)
            };
          });

          this.state.posts = [...this.state.posts, ...enrichedPosts];
          this.state.hasMore = result.meta.hasMore;
          this.state.page++;
          this.state.totalLikes = this.state.posts.reduce((sum, post) => sum + post.likes, 0);

          // Update loading UI
          this.methods.updateLoadingUI();
        } catch (error) {
          console.error('Failed to load posts:', error);
          this.state.hasMore = false;
          this.methods.updateLoadingUI();
        } finally {
          this.state.isLoading = false;
        }
      },

      updateLoadingUI() {
        const trigger = document.getElementById('load-more-trigger');
        if (!trigger) return;

        const spinner = trigger.querySelector('.spinner');
        const loadText = trigger.querySelector('.load-more-text');
        const endMessage = trigger.querySelector('.end-of-feed');

        if (spinner) spinner.style.display = this.state.isLoading ? 'block' : 'none';
        if (loadText) loadText.style.display = (!this.state.isLoading && this.state.hasMore) ? 'block' : 'none';
        if (endMessage) endMessage.style.display = !this.state.hasMore ? 'flex' : 'none';
      },

      loadMorePosts() {
        // If `this` is the component instance, prefer calling its method
        if (this && this.state && !this.state.isLoading && this.state.hasMore) {
          this.methods.loadPosts();
          return;
        }

        // Fallback: try to find the feed component from the ComponentManager
        try {
          const compManager = Now.getManager('component');
          const feed = compManager?.get?.('feed');
          if (feed && feed.methods && feed.state && !feed.state.isLoading && feed.state.hasMore) {
            feed.methods.loadPosts();
            return;
          }
        } catch (e) {
          console.warn('loadMorePosts fallback failed', e);
        }
      },

      toggleLike(postId) {
        const post = this.state.posts.find(p => p.id === postId);
        if (post) {
          post.liked = !post.liked;
          post.likes += post.liked ? 1 : -1;
          this.state.totalLikes = this.state.posts.reduce((sum, p) => sum + p.likes, 0);

          const nm = Now.getManager('notification');
          if (nm) {
            nm.show(post.liked ? 'Added to likes!' : 'Removed from likes', {
              type: post.liked ? 'success' : 'info',
              duration: 2000
            });
          }
        }
      },

      showComments(postId) {
        Now.getManager('notification')?.show('Comments coming soon!', {type: 'info', duration: 2000});
      },

      sharePost(postId) {
        navigator.clipboard?.writeText(window.location.href);
        Now.getManager('notification')?.show('Link copied!', {type: 'success', duration: 2000});
      },

      bookmarkPost(postId) {
        const post = this.state.posts.find(p => p.id === postId);
        if (post) {
          post.bookmarked = !post.bookmarked;
          Now.getManager('notification')?.show(post.bookmarked ? 'Saved!' : 'Removed', {
            type: 'success',
            duration: 2000
          });
        }
      },

      createPost(event) {
        event?.preventDefault();
        const content = this.state.newPost.content?.trim();
        if (!content) return;

        const newPost = {
          id: `new-${Date.now()}`,
          userId: '1',
          content: content,
          media: [],
          likes: 0,
          liked: false,
          comments: 0,
          bookmarked: false,
          createdAt: new Date().toISOString(),
          user: this.state.users['1'] || {name: 'You', avatar: 'https://i.pravatar.cc/150?img=5', handle: '@you'},
          timeAgo: 'Just now',
          mediaGridClass: ''
        };

        this.state.posts = [newPost, ...this.state.posts];
        this.state.newPost.content = '';
        Now.getManager('notification')?.show('Posted!', {type: 'success', duration: 2000});
      },

      formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
        return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
      },

      getMediaGridClass(count) {
        if (count === 0) return '';
        if (count === 1) return 'media-single';
        if (count === 2) return 'media-double';
        return 'media-multi';
      }
    },

    async mounted() {
      try {
        // Load initial posts from PHP API
        await this.methods.loadPosts();
      } catch (error) {
        console.error('Failed to initialize feed:', error);
      }
    }
  });

  // Setup infinite scroll after a brief delay to ensure component is ready
  setTimeout(() => {
    const trigger = document.getElementById('load-more-trigger');
    if (trigger) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // Find the feed component instance reliably from the component manager
            try {
              const compManager = Now.getManager('component');
              let feedInstance = null;
              if (compManager && compManager.instances) {
                for (const inst of compManager.instances.values()) {
                  if (inst && (inst._definition?.name === 'feed' || inst.element?.dataset?.component === 'feed')) {
                    feedInstance = inst;
                    break;
                  }
                }
              }

              // Only trigger if we have more posts to load
              if (feedInstance && feedInstance.state?.hasMore && !feedInstance.state?.isLoading) {
                if (feedInstance.methods && typeof feedInstance.methods.loadMorePosts === 'function') {
                  feedInstance.methods.loadMorePosts();
                }
              }
            } catch (e) {
              console.warn('Infinite scroll observer failed to trigger loadMorePosts', e);
            }
          }
        });
      }, {threshold: 0.1});
      observer.observe(trigger);
    }
  }, 1500);
}
