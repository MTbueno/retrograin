
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
        console.error("Google API Key (NEXT_PUBLIC_GOOGLE_API_KEY) is missing from your .env file.");
        alert("Configuração Faltando: A Chave de API do Google (NEXT_PUBLIC_GOOGLE_API_KEY) não foi encontrada no seu arquivo .env. As funcionalidades do Google Drive não funcionarão.");
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
        let userErrorMessage = "Falha Crítica ao Inicializar a API do Google Drive.\n\n";
        userErrorMessage += "A causa MAIS PROVÁVEL é um problema com a sua Chave de API do Google (`NEXT_PUBLIC_GOOGLE_API_KEY`) ou suas configurações no Google Cloud Console.\n\n";
        userErrorMessage += "VERIFIQUE ATENTAMENTE:\n";
        userErrorMessage += "1. CHAVE DE API NO ARQUIVO .env:\n";
        userErrorMessage += "   - A `NEXT_PUBLIC_GOOGLE_API_KEY` no seu arquivo .env está EXATAMENTE CORRETA? Copie e cole novamente do Google Cloud Console para ter certeza.\n";
        userErrorMessage += "   - Você REINICIOU o servidor de desenvolvimento (npm run dev) após salvar o arquivo .env?\n\n";
        userErrorMessage += "2. GOOGLE CLOUD CONSOLE (para o projeto da Chave de API):\n";
        userErrorMessage += "   a. A 'Google Drive API' está ATIVADA?\n";
        userErrorMessage += "      (Vá em 'APIs e Serviços' > 'APIs e serviços ativados')\n\n";
        userErrorMessage += "   b. **RESTRIÇÕES DA CHAVE DE API:** Este é um ponto MUITO COMUM de erro.\n";
        userErrorMessage += "      - **Restrições de aplicativo (Referenciadores HTTP):**\n";
        userErrorMessage += "         - Se houver restrições, `http://localhost:9002` (para desenvolvimento) e o domínio de produção (Ex: `https://seu-app.vercel.app`) DEVEM estar incluídos.\n";
        userErrorMessage += "         - **TESTE:** Tente configurar como 'Nenhuma' TEMPORARIAMENTE.\n";
        userErrorMessage += "      - **Restrições de API:**\n";
        userErrorMessage += "         - Se houver restrições, 'Google Drive API' DEVE estar na lista de APIs permitidas.\n";
        userErrorMessage += "         - **TESTE:** Tente configurar como 'Não restringir chave' TEMPORARIAMENTE.\n\n";
        userErrorMessage += "   c. **SUGESTÃO DE DIAGNÓSTICO:** Para isolar o problema, **REMOVA TEMPORARIAMENTE TODAS as restrições** da Chave de API no Google Cloud Console (referenciadores e de API). Se o aplicativo funcionar, o problema está nas configurações de restrição. Depois, adicione-as de volta cuidadosamente.\n\n";
        userErrorMessage += "Detalhes do erro técnico: " + ((error as Error).message || "Erro desconhecido") + "\n";
        userErrorMessage += "Consulte o console do navegador para mais detalhes técnicos (pode haver erros de CORS, 401 ou 403 relacionados à Chave de API).";
        alert(userErrorMessage);
        // driveApiLoaded will remain false, which should prevent further Drive operations.
      }
    });
  };
  document.body.appendChild(script);
}


export function initTokenClient(callback: (tokenResponse: google.accounts.oauth2.TokenResponse) => void): google.accounts.oauth2.TokenClient | null {
    if (!CLIENT_ID) {
        console.error("Google Client ID (NEXT_PUBLIC_GOOGLE_CLIENT_ID) is missing from your .env file.");
        alert("Configuração Faltando: O ID do Cliente Google (NEXT_PUBLIC_GOOGLE_CLIENT_ID) não foi encontrado no seu arquivo .env. A autenticação com o Google Drive não funcionará.");
        return null;
    }
     if (!gapiLoaded || typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        console.error("Google Identity Services (GIS) not loaded yet or 'google' is undefined. Cannot init token client.");
        // It's possible gapi loaded but google.accounts.oauth2 isn't ready immediately.
        // Retrying or delaying might be an advanced option, but for now, we alert.
        alert("Os Serviços de Identidade do Google (GIS) não parecem estar totalmente carregados. Isso pode ser um problema de carregamento da biblioteca do Google. Tente atualizar a página. Se persistir, verifique a conexão com a internet e o console do navegador para erros de script do Google.");
        return null;
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: callback, 
    });
    return tokenClient;
}

export function requestAccessToken() {
    if (tokenClient) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        console.error("Token client not initialized. Make sure initTokenClient was called successfully and CLIENT_ID is set.");
        alert("A conexão com o Google Drive não está pronta. Verifique se o ID do Cliente Google está configurado e tente novamente em um momento ou atualize a página.");
    }
}

export function revokeAccessToken() {
  const token = gapi.client.getToken();
  if (token !== null && token.access_token && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) { 
    google.accounts.oauth2.revoke(token.access_token, () => {
      console.log('Access token revoked.');
      gapi.client.setToken(null); 
    });
  } else {
    console.log('No access token to revoke or gapi client token is null, or google.accounts.oauth2 not available.');
  }
}


export async function ensureRetroGrainFolder(): Promise<string | null> {
  if (!isDriveAuthenticated()) { 
    console.error("Not authenticated with Google Drive for ensuring folder.");
    alert("Não autenticado com o Google Drive. Por favor, conecte ao Drive primeiro.");
    return null;
  }
  if (!driveApiLoaded || !gapi.client.drive) {
    console.error("Google Drive API client not loaded. Cannot ensure folder.");
    alert("API do Google Drive não carregada. Não é possível verificar/criar a pasta.");
    return null;
  }

  try {
    const response = await gapi.client.drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='RetroGrain' and trashed=false",
      fields: 'files(id, name)',
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
        // @ts-ignore TODO: Fix this type once gapi types are better or use a more specific type
        resource: fileMetadata,
        fields: 'id',
      });
      if (createResponse.result.id) {
        console.log('Created folder "RetroGrain" with ID:', createResponse.result.id);
        return createResponse.result.id;
      } else {
        console.error('Failed to create folder "RetroGrain", ID missing in response.');
        alert('Falha ao criar a pasta "RetroGrain" no Google Drive.');
        return null;
      }
    }
  } catch (error: any) {
    console.error('Error ensuring RetroGrain folder:', error);
    alert(`Erro com a operação da pasta no Google Drive: ${error.result?.error?.message || error.message}`);
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
    alert("Não autenticado com o Google Drive. Por favor, conecte ao Drive primeiro.");
    return null;
  }
  if (!driveApiLoaded || !gapi.client.drive) {
    console.error("Google Drive API client not loaded. Cannot upload file.");
    alert("API do Google Drive não carregada. Não é possível fazer o upload do arquivo.");
    return null;
  }

  try {
    const MimeType = 'image/jpeg';
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

    const token = gapi.client.getToken();
    if (!token || !token.access_token) {
        console.error('No access token found for Drive upload.');
        alert('Token de acesso ao Google Drive não encontrado. Tente reconectar ao Drive.');
        return null;
    }
    
    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: new Headers({ Authorization: 'Bearer ' + token.access_token }),
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
    const message = error.result?.error?.message || error.message || 'Um erro desconhecido ocorreu durante o upload.';
    alert(`Erro ao fazer upload para o Google Drive: ${message}`);
    return null;
  }
}

export function isDriveAuthenticated(): boolean {
    const token = gapi.client.getToken();
    // Check if gapi and gapi.client are loaded before trying to access getToken
    const gapiClientAvailable = typeof gapi !== 'undefined' && typeof gapi.client !== 'undefined';
    return !!(gapiLoaded && driveApiLoaded && gapiClientAvailable && token && token.access_token);
}

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}
