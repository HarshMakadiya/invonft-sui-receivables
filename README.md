# InvoNFT Receivables Console

React + TypeScript + Tailwind frontend for the InvoNFT PRD.

The app focuses on product workflow instead of pitch content:

- Receivables command dashboard
- Create receivable flow
- Invoice detail and evidence health score
- Financing marketplace
- Buyer portfolio
- Mock issuer, buyer, and payer roles

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Then visit:

```text
http://localhost:5173
```

## Deployment Direction

Cloudflare Pages is fine for the frontend. Build command: `npm run build`.
Output directory: `dist`.

Walrus Sites is the Sui-native static hosting path: deploy the built `dist/`
folder with `site-builder`. It is static-only, so no SSR, no server routes, and
no private environment secrets in the frontend bundle.

## Next Integration Steps

1. Replace mock invoice storage with Sui object reads.
2. Replace simulated evidence with Walrus upload/download.
3. Replace mock wallet selector with Sui wallet connection.
4. Convert mock actions into transaction builders.
# invonft-sui-receivables
