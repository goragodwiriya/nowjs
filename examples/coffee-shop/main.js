// ========================================
// Coffee Shop - Main Application
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Detect current directory path
    const currentPath = window.location.pathname;
    const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);

    // Initialize Now.js Framework
    await Now.init({
      environment: 'production',

      // Path configuration
      paths: {
        templates: `${currentDir}templates`
      },

      // Scroll Manager
      scroll: {
        enabled: true,
        core: {
          offset: 80,
          duration: 800,
          easing: 'easeInOutCubic'
        },
        smoothScroll: {
          enabled: true,
          hashChangeEnabled: true
        },
        scroll: {
          reveal: {
            enabled: true,
            threshold: 0.1,
            rootMargin: '50px'
          },
          parallax: {
            enabled: true
          },
          section: {
            highlight: true
          }
        }
      }
    });

    // Create application instance
    const app = await Now.createApp({
      name: 'Bean & Brew',
      version: '1.0.0'
    });


    // ปุ่มตะกร้า
    document.getElementById('cart-btn').addEventListener('click', toggleCart);
    document.getElementById('close-cart').addEventListener('click', toggleCart);
  } catch (error) {
    console.error('Application initialization failed:', error);
  }
});
// สถานะของแอปพลิเคชัน
const AppState = {
  cart: []
};

// ========================================
// Cart Management
// ========================================

// เพิ่มสินค้าลงตะกร้า
function addToCart(item) {
  if (!item || !item.id) return;

  // ตรวจสอบว่ามีในตะกร้าแล้วหรือไม่
  const existingItem = AppState.cart.find(cartItem => cartItem.id === item.id);

  if (existingItem) {
    existingItem.quantity++;
  } else {
    AppState.cart.push({
      ...item,
      quantity: 1
    });
  }

  updateCartUI();
  NotificationManager.success(`เพิ่ม ${item.name} ลงตะกร้าแล้ว`);
}

// ลบสินค้าออกจากตะกร้า
function removeFromCart(productId) {
  AppState.cart = AppState.cart.filter(item => item.id !== productId);
  updateCartUI();
  NotificationManager.error('ลบสินค้าออกจากตะกร้าแล้ว');
}

// เปลี่ยนจำนวนสินค้า
function updateQuantity(productId, change) {
  const item = AppState.cart.find(item => item.id === productId);
  if (!item) return;

  item.quantity += change;

  if (item.quantity <= 0) {
    removeFromCart(productId);
  } else {
    updateCartUI();
  }
}

// เคลียร์ตะกร้าสินค้า (ใช้หลังชำระเงินสำเร็จ)
function clearCart() {
  AppState.cart = [];
  updateCartUI();

  // ปิด cart sidebar ถ้าเปิดอยู่
  const sidebar = document.getElementById('cart-sidebar');
  if (sidebar && sidebar.classList.contains('active')) {
    sidebar.classList.remove('active');
  }
}

// คำนวณยอดรวม
function calculateTotal() {
  const subtotal = AppState.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const deliveryFee = subtotal >= SHOP_CONFIG.freeDeliveryMinimum ? 0 : SHOP_CONFIG.deliveryFee;
  const total = subtotal + deliveryFee;

  return {subtotal, deliveryFee, total};
}

// อัพเดท UI ตะกร้า
function updateCartUI() {
  const cartBody = document.getElementById('cart-body');
  const cartBadge = document.getElementById('cart-badge');
  const checkoutBtn = document.getElementById('checkout-btn');

  // อัพเดท badge
  const totalItems = AppState.cart.reduce((sum, item) => sum + item.quantity, 0);
  cartBadge.textContent = totalItems;
  document.getElementById('cart-btn').setAttribute('data-cart-count', totalItems);

  // ถ้าตะกร้าว่าง
  if (AppState.cart.length === 0) {
    cartBody.innerHTML = `
      <div class="cart-empty">
        <p>🛒</p>
        <p>ตะกร้าว่างเปล่า</p>
      </div>
    `;
    checkoutBtn.disabled = true;
    document.querySelector('.total-price').textContent = '฿0';
    return;
  }

  // แสดงรายการสินค้า
  cartBody.innerHTML = AppState.cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-image" style="background-image: url('images/${item.image}')"></div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">฿${Utils.number.format(item.price, 0)}</div>
        <div class="cart-item-controls">
          <button class="btn-qty" onclick="updateQuantity(${item.id}, -1)">−</button>
          <span class="qty-display">${item.quantity}</span>
          <button class="btn-qty" onclick="updateQuantity(${item.id}, 1)">+</button>
          <button class="btn-remove icon-delete" onclick="removeFromCart(${item.id})"></button>
        </div>
      </div>
    </div>
  `).join('');

  // อัพเดทยอดรวม
  const {subtotal, total} = calculateTotal();
  document.querySelector('.total-price').textContent = '฿' + Utils.number.format(total, 0);

  // ✅ อัปเดต hidden fields สำหรับส่งไป server
  const cartDataInput = document.getElementById('cart-data');
  const cartSubtotalInput = document.getElementById('cart-subtotal');
  const cartTotalInput = document.getElementById('cart-total');

  if (cartDataInput) {
    cartDataInput.value = JSON.stringify(AppState.cart);
  }
  if (cartSubtotalInput) {
    cartSubtotalInput.value = subtotal;
  }
  if (cartTotalInput) {
    cartTotalInput.value = total;
  }

  checkoutBtn.disabled = false;
}

// เปิด/ปิดตะกร้า
function toggleCart() {
  const sidebar = document.getElementById('cart-sidebar');

  sidebar.classList.toggle('active');
}