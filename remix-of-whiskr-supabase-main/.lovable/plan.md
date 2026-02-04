

# Plan: Change Hero Text Font to Plus Jakarta Sans

## Overview
Update the hero heading elements ("Think clearer." and "Chart faster. Care better.") to use Plus Jakarta Sans instead of Metzler.

## Changes Required

### File: `src/pages/Index.tsx`

**Line 240** - Change the h1 heading:
- Replace `font-heading` with `font-sans` (which maps to Plus Jakarta Sans/Inter)
- Or add a custom class for Plus Jakarta Sans specifically

**Line 243** - Change the p element with gradient text:
- Replace `font-heading` with `font-sans`

### Updated Code

**Line 240:**
```tsx
<h1 className="text-[clamp(36px,7vw,56px)] font-extrabold leading-[1.1] mb-4 text-[#101235] tracking-tight hero-animate-delay-1 font-sans">
```

**Line 243:**
```tsx
<p className="text-[clamp(28px,5vw,42px)] font-extrabold leading-[1.1] mb-4 tracking-tight hero-animate-delay-1 font-sans">
```

## Result
- The hero text will use **Plus Jakarta Sans** (which is now loaded via Google Fonts)
- The `font-sans` utility in Tailwind is configured to use Inter/Poppins, but since Plus Jakarta Sans is loaded and specified in index.html, we may want to update the Tailwind config to include it
- Alternatively, we can use inline style `fontFamily: "'Plus Jakarta Sans', sans-serif"` for explicit control

## Files to Modify
| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Update lines 240 and 243 to use Plus Jakarta Sans |

