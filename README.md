# Real or Not (C2PA)

Client-only demo that verifies C2PA/Content Credentials for images in the browser using the c2pa JavaScript SDK. No backend required.

### Features
- Verify presence of a C2PA manifest and show basic provenance details
- Distinguish between Real (verified), Generated (AI flag present), and Untrusted (validation warnings)
- Runs entirely in-browser; loads the SDK from a CDN

### Quick start
```bash
pnpm i
pnpm dev
```
Then open the printed URL.

### Testing images
Most images on the web don’t include Content Credentials. Try the C2PA public test files:
`https://spec.c2pa.org/public-testfiles/image/`

### Build
```bash
pnpm build
pnpm preview
```

### Lint & type-check
```bash
pnpm lint
pnpm lint:fix
pnpm typecheck
```

### Tech
- React 19, TypeScript 5, Vite 7
- Tailwind CSS (via @tailwindcss/vite)
- ESLint (flat config)

### Notes
- The SDK and worker/wasm are loaded from `jsdelivr`. For production, consider pinning versions and self-hosting assets.
- This project does not perform server-side verification.

### License
MIT
