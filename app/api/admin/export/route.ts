import { getDbData } from '@/lib/db';

export async function GET() {
  const data = getDbData();
  const names = data.students
    .map((student) => student.name.trim())
    .filter(Boolean);

  return new Response(
    JSON.stringify(
      {
        source: 'qr-gaap',
        exportedAt: new Date().toISOString(),
        names,
      },
      null,
      2,
    ),
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="qr-gaap-student-names.json"',
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
  );
}
