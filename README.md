This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Exporting Names for the Raffle

From `/admin`, select **Export Names** to download `qr-gaap-student-names.json`. The export contains the registered student names in a format that can be imported by the Netflix-themed raffle project:

```json
{
  "source": "qr-gaap",
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "names": ["Student One", "Student Two"]
}
```

## Registration Mode

From `/admin`, use **Registration Mode** to choose how participants are registered:

- **NFC Reader** reads the card UID and looks up the participant through the DLSL student portal.
- **Student Number** lets the participant type their student number for a DLSL portal lookup.
- **Manual Name Entry** lets the participant enter their name directly without a student-number lookup.

The selected mode is saved in `data.json` and applies to the public registration page immediately.

## NFC Card Reader

In **NFC Reader** mode, QR-GAAP accepts input from a USB NFC reader configured as a keyboard wedge (HID keyboard). No local PC/SC bridge is used. Start the website with:

```bash
npm run dev
```

Configure the reader to type the card UID as hexadecimal characters without a `0x` prefix or separators, and to finish with Enter or a short pause. The scan field must be focused and the browser page must be in the foreground. QR-GAAP buffers the scan, normalizes the UID to lowercase, and posts it to `/api/join`; the server passes that value to the DLSL lookup as `card_tag`.

The UI says it is waiting for card input; it does not claim the reader is connected because keyboard input cannot establish the reader's physical connection state. Student Number and Manual Name Entry remain available as admin-selected modes.

## Deployment Data Persistence

The app currently reads and writes registrations, groups, and registration mode in the local `data.json` file. Vercel's serverless runtime does not provide durable writable storage for this file, so registrations and admin changes may not persist reliably across deployments or function instances. Use a persistent database before relying on Vercel for live event data; this is separate from NFC input support.

From `/admin`, select **Add Participant** to add a person directly without a DLSL lookup. Enter a name and optionally provide a student number or card UID; the participant is assigned to the least-filled group.
