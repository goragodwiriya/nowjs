# Typography Example

ตัวอย่าง Typography ทั้งหมดที่ Now.js รองรับใน `now.core.min.css` (reset.css · utilities.css · layout.css · components.css) และ `fonts.css`

## Headings

```html
<h1>H1</h1>  <!-- ใช้โดย Theme -->
<h2>H2</h2>  <!-- ใช้ในส่วนหัวของ section -->
<h3>H3</h3>  <!-- หัวข้อฟอร์มหรือตาราง -->
<h4>H4</h4> <h5>H5</h5> <h6>H6</h6>
```

ขนาด h1–h6 = `--font-size-4xl`, `3xl`, `2xl`, `xl`, `lg`, `base` · ฟอนต์ `--font-family-heading` · น้ำหนัก `--font-weight-heading` (600)

## Font tokens (ตัวแปร CSS — ไม่มี class ขนาด/น้ำหนัก)

| กลุ่ม | ตัวแปร |
|---|---|
| ขนาด | `--font-size-xs` 0.75 · `sm` 0.875 · `base` 1 · `lg` 1.125 · `xl` 1.25 · `2xl` 1.5 · `3xl` 1.875 · `4xl` 2.25 · `5xl` 3 (rem) |
| น้ำหนัก | `--font-weight-light` 300 · `normal` 400 · `medium` 500 · `semibold` 600 · `bold` 700 · `heading` 600 |
| ระยะบรรทัด | `--line-height-none` 1 · `tight` 1.25 · `snug` 1.375 · `base` 1.5 · `relaxed` 1.625 · `loose` 2 |
| ฟอนต์ | `--font-family-base` (Sarabun) · `--font-family-heading` · `--font-family-mono` |

ฟอนต์ในโปรเจ็ค (ออฟไลน์): Sarabun 400/600/700 และ Kanit 300–700 ผ่าน `Now/css/fonts.css`

```css
.price { font-size: var(--font-size-2xl); }
:root { --font-family-heading: 'Kanit', var(--font-family-base); }
```

## Alignment

```html
<p class="left">...</p>     <!-- หรือ text-left -->
<p class="center">...</p>   <!-- หรือ text-center -->
<p class="right">...</p>    <!-- หรือ text-right -->
<p class="justify">...</p>  <!-- หรือ text-justify -->
```

`left` / `right` / `center` บน `.flex` = การจัดวาง flex ไม่ใช่การจัดข้อความ

## Inline text

```html
<em>สีแดง ไม่เอียง</em> <strong>หนา</strong> <b>หนา</b> <i>เอียง</i> <dfn>เอียง</dfn>
<u>เส้นใต้</u> <ins>เส้นใต้</ins> <del>ขีดฆ่า</del> <s>ขีดฆ่า</s>
<mark>ไฮไลต์</mark> <abbr title="...">ตัวย่อ</abbr> <sub>ห้อย</sub> <sup>ยก</sup>
<small>เล็ก</small> <big>ใหญ่</big> <span class="small">เล็ก</span> <span class="big">ใหญ่</span>
<p class="comment">หมายเหตุ (สีเขียว เล็กลง)</p>
```

## Code

```html
<code>inline code</code> <kbd>Ctrl</kbd> <samp>output</samp>
<pre>preformatted (pre-wrap)</pre>
<blockquote>quote</blockquote>
```

## Lists

```html
<ul>...</ul> <ol>...</ol>
<ul class="list-style-none"><li><span class="icon-valid">...</span></li></ul>
```

## Colors

Text `color-*` (มี `!important`) และ background `bg-*`:

`primary` · `white` · `light` · `silver` · `gray` · `dark-gray` · `dark` · `black` · `blue` · `brown` · `cyan` · `gold` · `green` · `magenta` · `orange` · `pink` · `purple` · `rosy` · `red`

## Status messages

```html
<p class="success">...</p>      <!-- success / info / warning / error / danger -->
<aside class="warning">...</aside>  <!-- กล่องมีพื้นหลังและกรอบ ซ่อนกรอบเมื่อว่าง -->
```

## Badges

```html
<span class="badge-success" data-badge="10">Inbox</span>   <!-- ป้ายต่อท้าย -->
<span class="badge-warning">รอดำเนินการ</span>              <!-- ทั้ง element เป็นป้าย -->
```

ชนิด: `badge-success` · `badge-info` · `badge-warning` · `badge-error` · `badge-danger`

## Status colors

```html
<mark class="status1">Active</mark>   <!-- status0 – status11 จาก --color-0 … --color-11 -->
```

## Truncation & white space

```html
<p class="two_line">...</p>   <!-- one_line / two_line / three_line / four_line -->
<td class="nowrap">...</td>
<p class="pre-line">...</p>   <!-- รักษาการขึ้นบรรทัด -->
<p class="wrap">...</p>       <!-- white-space: normal -->
```

## Icons & accessibility

```html
<h4 class="icon-info">หัวข้อ</h4>   <!-- icon-* ทำให้ element เป็น inline-flex -->
<button class="btn icon-search"><span class="sr-only">ค้นหา</span></button>
```

## Files

| File | Description |
|------|-------------|
| `index.html` | หน้าแสดงตัวอย่าง Typography ทั้งหมด |
| `main.js` | การตั้งค่า Now.js Framework |
| `styles.css` | Custom styles |
