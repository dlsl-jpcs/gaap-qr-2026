import { getDbData } from '@/lib/db';
import { isAdminSessionValid } from '@/lib/admin-session';

export async function GET(request: Request) {
  if (!isAdminSessionValid(request)) {
    return Response.json({ success: false, message: 'Admin login required.' }, { status: 401 });
  }

  try {
    const data = await getDbData();
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
  } catch (error) {
    console.error('Unable to export participant names:', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({ success: false, message: 'Unable to export participant names.' }, { status: 503 });
  }
}
