import keytar from 'keytar';

const SERVICE_NAME = 'rootly-wizard';
const ACCOUNT_NAME = 'rootly-token';

export async function getStoredToken() {
  try {
    return await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
  } catch {
    return null;
  }
}

export async function storeToken(token) {
  try {
    return await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, token);
  } catch {
    return false;
  }
}

export async function deleteToken() {
  try {
    return await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
  } catch {
    return false;
  }
}

export async function validateToken(token, baseUrl = 'https://api.rootly.com') {
  const response = await fetch(new URL('/v1/users/me', baseUrl), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  return response.ok;
}
