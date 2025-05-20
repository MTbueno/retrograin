
'use client';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// Array of API discovery doc URLs for APIs used.
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let gapiLoaded = false;
// let gapiInitialized = false; // This variable was unused
let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let driveApiLoaded = false;


export function loadGapi(callback: () => void) {
  if (gapiLoaded) {
    if (driveApiLoaded && callback) callback();
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://apis.google.com/js/api.js';
  script.onload = () => {
    gapiLoaded = true;
    gapi.load('client', async () => {
      if (!API_KEY) {
        console.error("Google API Key is missing. Please set NEXT_PUBLIC_GOOGLE_API_KEY in your .env file.");
        alert("Google API Key is missing. Drive features will not work.");
        return;
      }
      try {
        await gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: DISCOVERY_DOCS,
        });
        driveApiLoaded = true;
        if (callback) callback();
      } catch (error) {
        console.error("Error initializing Google API client (gapi.client.init):", error);
        let userErrorMessage = "Failed to initialize Google Drive API. Please check the following:\n\n";
        userErrorMessage += "1. Your `NEXT_PUBLIC_GOOGLE_API_KEY` in the .env file is correct.\n";
        userErrorMessage += "2. The Google Drive API is enabled in your Google Cloud Console project.\n";
        userErrorMessage += "3. The API key has no restrictions preventing its use (e.g., HTTP referrer or API restrictions).\n\n";
        userErrorMessage += "Details: " + ((error as Error).message || "Unknown error");
        alert(userErrorMessage);
        // driveApiLoaded will remain false, which should prevent further Drive operations.
      }
    });
  };
  document.body.appendChild(script);
}


export function initTokenClient(callback: (tokenResponse: google.accounts.oauth2.TokenResponse) => void): google.accounts.oauth2.TokenClient {
    if (!CLIENT_ID) {
        console.error("Google Client ID is missing. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your .env file.");
        alert("Google Client ID is missing. Drive features will not work.");
        // It might be better to throw an error or ensure tokenClient remains null
        // For now, this will proceed and likely cause issues later if not handled.
        // Consider returning early or throwing if CLIENT_ID is critical for this function's purpose.
        throw new Error("Google Client ID is missing. Cannot initialize token client.");
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: callback, // Callback to handle the token response
    });
    return tokenClient;
}

export function requestAccessToken() {
    if (tokenClient) {
        // Prompt the user to select a Google Account and asked for consent to share their data
        // when establishing a new session.
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        console.error("Token client not initialized. Make sure initTokenClient was called successfully.");
        alert("Google Drive connection is not ready. Please try again in a moment or refresh the page.");
    }
}

export function revokeAccessToken() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token, () => {
      console.log('Access token revoked.');
      gapi.client.setToken(null); // Clear the token from gapi client
    });
  }
}


export async function ensureRetroGrainFolder(): Promise<string | null> {
  if (!isDriveAuthenticated()) { // Changed to use isDriveAuthenticated for clarity
    console.error("Not authenticated with Google Drive for ensuring folder.");
    alert("Not authenticated with Google Drive. Please connect to Drive first.");
    return null; 
  }

  try {
    // 1. Search for the folder
    const response = await gapi.client.drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='RetroGrain' and trashed=false",
      fields: 'files(id, name)',
    });

    const files = response.result.files;
    if (files && files.length > 0) {
      console.log('Found folder "RetroGrain" with ID:', files[0].id);
      return files[0].id!;
    } else {
      // 2. Create the folder if it doesn't exist
      console.log('Folder "RetroGrain" not found, creating it...');
      const fileMetadata = {
        name: 'RetroGrain',
        mimeType: 'application/vnd.google-apps.folder',
      };
      const createResponse = await gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: 'id',
      });
      console.log('Created folder "RetroGrain" with ID:', createResponse.result.id);
      return createResponse.result.id!;
    }
  } catch (error: any) {
    console.error('Error ensuring RetroGrain folder:', error);
    alert(`Error with Google Drive folder operation: ${error.result?.error?.message || error.message}`);
    return null;
  }
}

export async function uploadFileToDrive(
  folderId: string,
  fileName: string,
  fileDataUrl: string
): Promise<gapi.client.drive.File | null> {
  if (!isDriveAuthenticated()) {
    console.error("Not authenticated with Google Drive for upload.");
    alert("Not authenticated with Google Drive. Please connect to Drive first.");
    return null;
  }

  try {
    const MimeType = 'image/jpeg';
    // Convert data URL to Blob
    const response = await fetch(fileDataUrl);
    const blob = await response.blob();

    const metadata = {
      name: `${fileName}.jpg`,
      parents: [folderId],
      mimeType: MimeType,
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    
    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: new Headers({ Authorization: 'Bearer ' + gapi.client.getToken()!.access_token }),
      body: form,
    });

    if (!uploadResponse.ok) {
        const errorBody = await uploadResponse.json();
        console.error('Error uploading file to Drive, server response:', errorBody);
        throw new Error(errorBody.error?.message || `Failed to upload file, status: ${uploadResponse.status}`);
    }

    const file = await uploadResponse.json();
    console.log('File uploaded successfully:', file);
    return file;

  } catch (error: any) {
    console.error('Error uploading file to Drive:', error);
    // Check if error.result.error.message exists, otherwise use error.message
    const message = error.result?.error?.message || error.message || 'An unknown error occurred during upload.';
    alert(`Error uploading to Google Drive: ${message}`);
    return null;
  }
}

// GIS does not have a direct sign out from gapi.client, but we can revoke token.
// The user signs out of Firebase for the app's main auth.
// For Drive, if a token is bad, they'll be prompted to re-auth on next action.
export function isDriveAuthenticated(): boolean {
    return !!(gapiLoaded && driveApiLoaded && gapi.client.getToken()?.access_token);
}
