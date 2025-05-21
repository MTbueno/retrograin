
'use client';

// Ensure environment variables are handled. These are critical.
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// Discovery Docs and Scopes for Google Drive API
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file'; // Allows creating files, listing folders

// State variables for the library
let gapiLoadedAndInitialized = false; // True when gapi.client.init completes successfully
let gisLoaded = false; // True when Google Identity Services script loads
let tokenClient: google.accounts.oauth2.TokenClient | null = null;

/**
 * Loads the Google API client library (gapi) and initializes it.
 * This function should be called once.
 * @param callback Function to execute after gapi is loaded and initialized.
 */
export function loadGapi(callback: () => void): void {
  if (gapiLoadedAndInitialized) {
    if (callback) callback();
    return;
  }

  if (!API_KEY) {
    console.error(
      "CRITICAL SETUP ISSUE: Google API Key (NEXT_PUBLIC_GOOGLE_API_KEY) is missing." +
      " Google Drive features will NOT work. Please check your .env file and ensure it's" +
      " correctly configured in your Vercel/hosting environment variables, then restart/redeploy."
    );
    // No alert here to avoid blocking UI, error is logged.
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://apis.google.com/js/api.js';
  script.async = true;
  script.defer = true;
  script.onload = () => {
    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: DISCOVERY_DOCS,
        });
        gapiLoadedAndInitialized = true;
        console.log("Google API Client (gapi) initialized successfully.");
        if (callback) callback();
      } catch (error: any) {
        gapiLoadedAndInitialized = false;
        console.error("Error initializing Google API client (gapi.client.init):", error);
        // Log a more user-friendly error for the developer to check console.
        console.error(
            "DETAILED ERROR: Falha Crítica ao Inicializar a API do Google Drive.\n\n" +
            "A CAUSA MAIS PROVÁVEL é um problema com a sua Chave de API do Google (`NEXT_PUBLIC_GOOGLE_API_KEY`) ou suas configurações no Google Cloud Console.\n\n" +
            "VERIFIQUE ATENTAMENTE:\n" +
            "1. CHAVE DE API NO ARQUIVO .env (E NO AMBIENTE DE BUILD/HOSPEDAGEM):\n" +
            "   - A `NEXT_PUBLIC_GOOGLE_API_KEY` está EXATAMENTE CORRETA? Copie e cole novamente do Google Cloud Console.\n" +
            "   - Você REINICIOU o servidor de desenvolvimento (npm run dev) após salvar o arquivo .env local?\n" +
            "   - Se estiver fazendo deploy (ex: Vercel), a variável de ambiente `NEXT_PUBLIC_GOOGLE_API_KEY` foi configurada CORRETAMENTE?\n\n" +
            "2. GOOGLE CLOUD CONSOLE (para o projeto da Chave de API):\n" +
            "   a. A 'Google Drive API' está ATIVADA?\n" +
            "   b. RESTRIÇÕES DA CHAVE DE API: Verifique referenciadores HTTP e restrições de API.\n" +
            "      - TESTE: Tente remover TEMPORARIAMENTE TODAS as restrições da Chave de API.\n\n" +
            "Detalhes do erro técnico: " + (error.message || "Erro desconhecido")
        );
      }
    });
  };
  script.onerror = () => {
    console.error("Failed to load the Google API script (gapi.js). Check network connection or script URL.");
  };
  document.body.appendChild(script);
}

/**
 * Loads the Google Identity Services (GIS) library.
 * This function should be called once.
 * @param callback Function to execute after GIS is loaded.
 */
export function loadGis(callback: () => void): void {
    if (gisLoaded) {
        if (callback) callback();
        return;
    }

    if (!CLIENT_ID) {
        console.error(
            "CRITICAL SETUP ISSUE: Google Client ID (NEXT_PUBLIC_GOOGLE_CLIENT_ID) is missing." +
            " Google Drive authentication will NOT work. Please check your .env file and ensure it's" +
            " correctly configured in your Vercel/hosting environment variables, then restart/redeploy."
        );
        return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
        gisLoaded = true;
        console.log("Google Identity Services (GIS) loaded successfully.");
        if (callback) callback();
    };
    script.onerror = () => {
        console.error("Failed to load the Google Identity Services script (accounts.google.com/gsi/client). Check network or script URL.");
    };
    document.body.appendChild(script);
}


/**
 * Initializes the Google OAuth 2.0 Token Client.
 * Should be called after both GAPI and GIS are loaded.
 * @param onTokenResponse Callback function to handle the token response.
 */
export function initTokenClient(onTokenResponse: (tokenResponse: google.accounts.oauth2.TokenResponse) => void): void {
  if (!gisLoaded) {
    console.error("GIS not loaded. Cannot initialize token client. Call loadGis() first.");
    return;
  }
  if (!CLIENT_ID) {
    console.error("Client ID is missing. Cannot initialize token client.");
    return; // Already logged in loadGis, but good to double check.
  }
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    console.error("Google Identity Services structure (google.accounts.oauth2) not available. GIS might not be fully initialized.");
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: onTokenResponse, // This callback receives the token or error
  });
  console.log("Google OAuth Token Client initialized.");
}

/**
 * Requests an access token from the user.
 * This will trigger the Google OAuth consent pop-up if needed.
 */
export function requestAccessToken(): void {
  if (!tokenClient) {
    console.error("Token client not initialized. Call initTokenClient() first.");
    // Potentially alert or provide UI feedback if this is user-triggered
    // alert("A conexão com o Google Drive não está pronta. Tente novamente em um momento ou atualize a página.");
    return;
  }
  tokenClient.requestAccessToken({ prompt: 'consent' }); // 'consent' forces the consent screen if not already granted for all scopes
}

/**
 * Revokes the current access token for the application.
 */
export function revokeAccessToken(): void {
  if (!gisLoaded || typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    console.warn("GIS not loaded or google.accounts.oauth2 not available, cannot revoke token.");
    return;
  }
  const token = gapi.client.getToken();
  if (token && token.access_token) {
    google.accounts.oauth2.revoke(token.access_token, () => {
      gapi.client.setToken(null); // Clear the token from gapi client
      console.log('Google Drive access token revoked.');
      // Potentially update UI state here (e.g., isDriveAuthorized = false) via a callback
    });
  } else {
    console.log('No access token to revoke or gapi client token is null.');
    gapi.client.setToken(null); // Ensure it's cleared if somehow inconsistent
  }
}

/**
 * Checks if the user is currently authenticated with Google Drive
 * (i.e., gapi client has a valid access token).
 * @returns True if authenticated, false otherwise.
 */
export function isDriveAuthenticated(): boolean {
  // gapiLoadedAndInitialized implies gapi.client is available
  if (!gapiLoadedAndInitialized) return false;
  const token = gapi.client.getToken();
  return !!(token && token.access_token);
}

/**
 * Ensures that a folder named "RetroGrain" exists in the user's Google Drive.
 * Creates the folder if it doesn't exist.
 * @returns The ID of the "RetroGrain" folder, or null if an error occurs.
 */
export async function ensureRetroGrainFolder(): Promise<string | null> {
  if (!isDriveAuthenticated()) {
    console.error("Not authenticated with Google Drive. Cannot ensure folder.");
    return null;
  }
  if (!gapiLoadedAndInitialized || !gapi.client.drive) {
    console.error("Google Drive API (gapi.client.drive) not loaded. Cannot ensure folder.");
    return null;
  }

  try {
    const response = await gapi.client.drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='RetroGrain' and trashed=false",
      fields: 'files(id, name)',
      pageSize: 1, // We only need to find one
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
      const createResponse = await gapi.client.drive.files.create({
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
    // Provide more specific error details if available from the API response
    const errorMessage = error.result?.error?.message || error.message || "Unknown error during folder operation.";
    console.error(`Google Drive API error during folder operation: ${errorMessage}`);
    return null;
  }
}

/**
 * Uploads a file (from a data URI) to a specified folder in Google Drive.
 * @param folderId The ID of the folder to upload the file to.
 * @param fileName The base name for the file (without extension).
 * @param fileDataUrl The data URI of the file to upload (e.g., a JPEG image).
 * @returns The Google Drive File object if successful, or null otherwise.
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
  if (!gapiLoadedAndInitialized || !gapi.client.drive) {
    console.error("Google Drive API (gapi.client.drive) not loaded. Cannot upload file.");
    return null;
  }

  try {
    // Assuming JPEG for RetroGrain, can be made dynamic if needed
    const mimeType = 'image/jpeg';
    const fileExtension = 'jpg';

    // Convert data URI to Blob
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

    const token = gapi.client.getToken();
    if (!token || !token.access_token) {
        console.error('No access token found for Drive upload. Re-authentication might be needed.');
        return null;
    }
    
    const uploadFetchResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: new Headers({ Authorization: 'Bearer ' + token.access_token }),
      body: form,
    });

    const file = await uploadFetchResponse.json(); // Parse JSON response

    if (!uploadFetchResponse.ok) {
        // Log the error body from Google for better debugging
        console.error('Error uploading file to Drive. Server response:', file);
        const errorMessage = file.error?.message || `Failed to upload file, status: ${uploadFetchResponse.status}`;
        throw new Error(errorMessage);
    }
    
    console.log('File uploaded successfully to Drive:', file);
    return file as gapi.client.drive.File;

  } catch (error: any) {
    console.error('Error during file upload to Drive:', error);
    // Ensure we show the actual error message if it's from the API
    const message = error.result?.error?.message || error.message || 'Um erro desconhecido ocorreu durante o upload.';
    console.error(`Google Drive API error during upload: ${message}`);
    return null;
  }
}

// TypeScript type declarations for Google API (gapi) and Google Identity Services (google)
// These help with autocompletion and type checking.
// You might need to install @types/gapi and @types/google.accounts if not already present,
// or adjust based on your project's setup.
declare global {
  interface Window {
    gapi: any; // Consider more specific types if available and working
    google: any; // Consider more specific types
  }
}
