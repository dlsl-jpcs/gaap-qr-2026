# DLSL Student Info API Snippet

This file contains the standalone logic to fetch student data from the DLSL portal. You can drop this directly into a new Node.js project.

## Requirements
You must install `axios` in your new project to use this snippet.
```bash
npm install axios
```

## The Code

```javascript
const axios = require('axios');
const https = require('https');

// The DLSL portal uses an invalid/expired SSL certificate, 
// so this agent bypasses the TLS verification.
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  secureProtocol: 'TLS_method'
});

async function fetchStudentInfo(studentId) {
  // If no env variables are set, these defaults are used
  const apiUrl = process.env.PORTAL_BASE_URL || 'https://portal.dlsl.edu.ph';
  const apiPath = process.env.PORTAL_HELPER_PATH || '/registration/event/helper.php';
  const regKey = process.env.REG_KEY ? process.env.REG_KEY.replace(/"/g, '') : '20250515U60HB0';

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
    if (!data.email_address || data.email_address === "") {
      return null;
    }

    // Return the extracted student data
    return {
      email: data.email_address.toLowerCase(),
      name: data.name || undefined,
      photo: data.photo || undefined,
    };

  } catch (error) {
    console.error('DLSL API request failed:', error.message);
    throw error;
  }
}

// === Helper Functions (Optional) ===
// These format the raw email (e.g., firstname_lastname@dlsl.edu.ph) into a clean display name.

function capitalize(word) {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function prettifyNamePart(part) {
  return (part || "").split("-").map(capitalize).join("-");
}

function deriveDisplayName(email) {
  const [local] = email.split("@");
  const nameParts = local.split("_");
  const formattedParts = nameParts.map((part) => prettifyNamePart(part));
  return formattedParts.filter(Boolean).join(" ");
}

// === Example Usage ===
async function test() {
  const info = await fetchStudentInfo("ENTER_CARD_TAG_OR_ID_HERE");
  
  if (info) {
    console.log("Student Data:", info);
    console.log("Display Name:", deriveDisplayName(info.email));
  } else {
    console.log("Student not found.");
  }
}

// test();

module.exports = {
  fetchStudentInfo,
  deriveDisplayName
};
```
