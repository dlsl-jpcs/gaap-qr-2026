import 'server-only';

import axios from 'axios';
import https from 'https';

// The DLSL portal uses an invalid/expired SSL certificate, 
// so this agent bypasses the TLS verification.
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  secureProtocol: 'TLS_method'
});

export async function fetchStudentInfo(studentId: string) {
  const apiUrl = process.env.PORTAL_BASE_URL || 'https://portal.dlsl.edu.ph';
  const apiPath = process.env.PORTAL_HELPER_PATH || '/registration/event/helper.php';
  const regKey = process.env.REG_KEY?.replace(/"/g, '');
  if (!regKey) throw new Error('REG_KEY is not configured on the server.');

  const formData = new URLSearchParams({
    action: 'registration_tapregister',
    regkey: regKey,
    card_tag: studentId
  });

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'dlsl-student-api/1.0',
    'Accept': 'application/json, text/plain, */*'
  };

  try {
    const response = await axios({
      method: 'POST',
      url: apiUrl + apiPath,
      data: formData.toString(),
      headers,
      httpsAgent,
      timeout: 15000,
      validateStatus: status => status < 500
    });

    const data = response.data;

    // Check if the student is actually registered
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      typeof data.email_address !== 'string' ||
      data.email_address.trim() === ""
    ) {
      return null;
    }

    // Return the extracted student data
    return {
      email: data.email_address.trim().toLowerCase(),
      name: data.name || undefined,
      photo: data.photo || undefined,
    };

  } catch (error: unknown) {
    console.error(
      'DLSL API request failed:',
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

// === Helper Functions ===

function capitalize(word: string) {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function prettifyNamePart(part: string) {
  return (part || "").split("-").map(capitalize).join("-");
}

export function deriveDisplayName(email: string) {
  const [local] = email.split("@");
  const nameParts = local.split("_");
  const formattedParts = nameParts.map((part) => prettifyNamePart(part));
  return formattedParts.filter(Boolean).join(" ");
}
