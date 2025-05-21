
'use client';

// Ensure environment variables are handled. These are critical.
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// Discovery Docs and Scopes for Google Drive API
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file'; // Allows creating files, listing folders

// State variables for the library
let gapiLoadedAndInitialized = false; // True when gapi.client.init completes successfully
let tokenClient: google.accounts.oauth2.TokenClient | null = null;

/**
 * Initializes the Google API client library (gapi.client).
 * Assumes gapi.js script (which defines window.gapi) is already loaded globally (e.g., via layout.tsx).
 * param callback Function to execute after gapi.client is loaded and initialized.
 */
export function loadGapi(callback: (success: boolean) => void): void {
  if (gapiLoadedAndInitialized) { // Flag to prevent re-initialization
    if (callback) callback(true);
    return;
  }

  // This check should ideally pass due to polling in the calling component (e.g., ActionButtonsSection)
  if (typeof window.gapi === 'undefined' || typeof window.gapi.load !== 'function' ) {
    console.error(
      "CRITICAL: window.gapi or window.gapi.load is undefined when loadGapi is called. " +
      "This indicates a problem with the script loading sequence or availability. " +
      "Ensure api.js is loaded before this function is effectively executed."
    );
    if (callback) callback(false);
    return;
  }

  if (!API_KEY) {
    console.error(
      "CRITICAL SETUP ISSUE: Google API Key (NEXT_PUBLIC_GOOGLE_API_KEY) is missing from your .env file or not accessible by the application. Google Drive features will NOT work. " +
      "PLEASE VERIFY: \n" +
      "1. The key NEXT_PUBLIC_GOOGLE_API_KEY is EXACTLY correct in your .env file (and in your Vercel/hosting environment variables if deploying). COPY & PASTE it again from Google Cloud Console.\n" +
      "2. You RESTARTED your Next.js development server (npm run dev) after saving the .env file.\n" +
      "3. In Google Cloud Console, for this API Key: \n" +
      "   a. Under 'API restrictions', ensure 'Google Drive API' is allowed (or set to 'Don't restrict key' FOR TESTING ONLY).\n" +
      "   b. Under 'Application restrictions', ensure 'HTTP referrers' are correctly set for your development (e.g., http://localhost:9002, your Firebase Studio/Vercel domain) and production domains (or set to 'None' FOR TESTING ONLY).\n" +
      "FAILURE TO DO SO WILL PREVENT GAPI FROM INITIALIZING."
    );
    if (callback) callback(false);
    return;
  }

  // Load the "client" library module and initialize it.
  window.gapi.load('client', async () => { // 'client' is for gapi.client
    try {
      await window.gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
      });
      gapiLoadedAndInitialized = true;
      console.log("Google API Client (gapi.client) initialized successfully.");
      if (callback) callback(true);
    } catch (error: any) {
      gapiLoadedAndInitialized = false;
      console.error("Error initializing Google API client (gapi.client.init):", error);
      const errorDetails = error.result?.error?.message || error.message || JSON.stringify(error.result || error);
      console.error(
          "DETAILED ERROR: Falha Crítica ao Inicializar a API do Google Drive (gapi.client.init).\n\n" +
          "A CAUSA MAIS PROVÁVEL é um problema com a sua Chave de API do Google (`NEXT_PUBLIC_GOOGLE_API_KEY`) ou suas configurações no Google Cloud Console.\n\n" +
          "VERIFIQUE ATENTAMENTE OS PONTOS MENCIONADOS NO ALERTA ANTERIOR SOBRE A CHAVE DE API E SUAS RESTRIÇÕES (especialmente referenciadores HTTP e restrições de API).\n" +
          "TENTE REMOVER TEMPORARIAMENTE TODAS AS RESTRIÇÕES DA CHAVE DE API NO GOOGLE CLOUD CONSOLE PARA TESTAR.\n\n" +
          "Detalhes do erro técnico: " + errorDetails
      );
      if (callback) callback(false);
    }
  });
}


/**
 * Initializes the Google OAuth 2.0 Token Client.
 * Should be called after GIS (Google Identity Services) script is loaded and gapi client is ready.
 * param onTokenResponse Callback function to handle the token response.
 * returns True if initialization was attempted successfully (GIS available, CLIENT_ID present), false otherwise.
 */
export function initTokenClient(
  onTokenResponse: (tokenResponse: google.accounts.oauth2.TokenResponse) => void
): boolean {
  if (typeof window.google === 'undefined' || !window.google.accounts || !window.google.accounts.oauth2) {
    console.error("GIS (Google Identity Services) not available (window.google.accounts.oauth2 is undefined). Cannot initialize token client. Ensure GIS script is loaded from layout.tsx and has finished loading.");
    return false;
  }

  if (!CLIENT_ID) {
    console.error(
      "CRITICAL SETUP ISSUE: Google Client ID (NEXT_PUBLIC_GOOGLE_CLIENT_ID) is missing. Google Drive authentication will NOT work. " +
      "Please check your .env file and Vercel/hosting environment variables, then restart/redeploy."
    );
    return false;
  }

  try {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: onTokenResponse,
    });
    console.log("Google OAuth Token Client initialized.");
    return true;
  } catch (error) {
    console.error("Error during google.accounts.oauth2.initTokenClient(): ", error);
    tokenClient = null;
    return false;
  }
}

/**
 * Requests an access token from the user.
 * This will trigger the Google OAuth consent pop-up if needed.
 */
export function requestAccessToken(): void {
  if (tokenClient) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
     console.error("Token client not initialized. Call initTokenClient() successfully first.");
     // It might be useful to provide UI feedback here, e.g., a toast.
  }
}

/**
 * Revokes the current access token for the application.
 */
export function revokeAccessToken(): void {
  if (typeof window.google === 'undefined' || !window.google.accounts || !window.google.accounts.oauth2) {
    console.warn("GIS not available, cannot revoke token.");
    return;
  }
  const currentGapiToken = window.gapi?.client?.getToken();
  if (currentGapiToken && currentGapiToken.access_token) {
    window.google.accounts.oauth2.revoke(currentGapiToken.access_token, () => {
      if (window.gapi && window.gapi.client) {
        window.gapi.client.setToken(null); // Clear the token from gapi client
      }
      console.log('Google Drive access token revoked.');
    });
  } else {
    console.log('No access token to revoke or gapi client token is null.');
    if (window.gapi && window.gapi.client) {
        window.gapi.client.setToken(null); // Ensure it's cleared if somehow inconsistent
    }
  }
}

/**
 * Checks if the user is currently authenticated with Google Drive
 * (i.e., gapi.client is initialized and has a valid access token).
 * returns True if authenticated, false otherwise.
 */
export function isDriveAuthenticated(): boolean {
  if (!gapiLoadedAndInitialized) return false; // GAPI client must be initialized
  const currentGapiToken = window.gapi?.client?.getToken();
  return !!(currentGapiToken && currentGapiToken.access_token);
}

/**
 * Ensures that a folder named "RetroGrain" exists in the user's Google Drive.
 * Creates the folder if it doesn't exist.
 * returns The ID of the "RetroGrain" folder, or null if an error occurs.
 */
export async function ensureRetroGrainFolder(): Promise<string | null> {
  if (!isDriveAuthenticated()) {
    console.error("Not authenticated with Google Drive. Cannot ensure folder.");
    return null;
  }
  if (!gapiLoadedAndInitialized || !window.gapi?.client?.drive) {
    console.error("Google Drive API (gapi.client.drive) not loaded/initialized. Cannot ensure folder.");
    return null;
  }

  try {
    const response = await window.gapi.client.drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='RetroGrain' and trashed=false",
      fields: 'files(id, name)',
      pageSize: 1,
    });

    const files = response.result.files;
    if (files && files.length > 0 && files[0].id) {
      console.log('Found folder "RetroGrain" with ID:', files[0].id);
      return files[0].id;
    } else {
      console.log('Folder "RetroGrain" not found, creating it...');
      const fileMetadata = {
        name: 'RetroGrain',
        mimeType: 'application/vnd.google-apps.folder',
      };
      const createResponse = await window.gapi.client.drive.files.create({
        // @ts-ignore
        resource: fileMetadata,
        fields: 'id',
      });
      if (createResponse.result.id) {
        console.log('Created folder "RetroGrain" with ID:', createResponse.result.id);
        return createResponse.result.id;
      } else {
        console.error('Failed to create folder "RetroGrain", ID missing in response:', createResponse);
        return null;
      }
    }
  } catch (error: any) {
    console.error('Error ensuring RetroGrain folder:', error);
    const errorMessage = error.result?.error?.message || error.message || "Unknown error during folder operation.";
    console.error(`Google Drive API error during folder operation: ${errorMessage}`);
    return null;
  }
}

/**
 * Uploads a file (from a data URI) to a specified folder in Google Drive.
 * param folderId The ID of the folder to upload the file to.
 * param fileName The base name for the file (without extension).
 * param fileDataUrl The data URI of the file to upload (e.g., a JPEG image).
 * returns The Google Drive File object if successful, or null otherwise.
 */
export async function uploadFileToDrive(
  folderId: string,
  fileName: string,
  fileDataUrl: string
): Promise<gapi.client.drive.File | null> {
  if (!isDriveAuthenticated()) {
    console.error("Not authenticated with Google Drive. Cannot upload file.");
    return null;
  }
  if (!gapiLoadedAndInitialized || !window.gapi?.client?.drive) {
    console.error("Google Drive API (gapi.client.drive) not loaded/initialized. Cannot upload file.");
    return null;
  }

  try {
    const mimeType = 'image/jpeg';
    const fileExtension = 'jpg';

    const response = await fetch(fileDataUrl);
    const blob = await response.blob();

    const metadata = {
      name: `${fileName}.${fileExtension}`,
      parents: [folderId],
      mimeType: mimeType,
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const currentGapiToken = window.gapi.client.getToken();
    if (!currentGapiToken || !currentGapiToken.access_token) {
        console.error('No access token found for Drive upload. Re-authentication might be needed.');
        return null;
    }

    const uploadFetchResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: new Headers({ Authorization: 'Bearer ' + currentGapiToken.access_token }),
      body: form,
    });

    const file = await uploadFetchResponse.json();

    if (!uploadFetchResponse.ok) {
        console.error('Error uploading file to Drive. Server response:', file);
        const errorMessage = file.error?.message || `Failed to upload file, status: ${uploadFetchResponse.status}`;
        throw new Error(errorMessage);
    }

    console.log('File uploaded successfully to Drive:', file);
    return file as gapi.client.drive.File;

  } catch (error: any) {
    console.error('Error during file upload to Drive:', error);
    const message = error.result?.error?.message || error.message || 'Um erro desconhecido ocorreu durante o upload.';
    console.error(`Google Drive API error during upload: ${message}`);
    // Consider providing more specific UI feedback based on the error if possible
    return null;
  }
}

// TypeScript type declarations for Google API (gapi) and Google Identity Services (google)
// These ensure TypeScript knows about window.gapi and window.google
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}
