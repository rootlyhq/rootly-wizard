export class RootlyApiClient {
  constructor(token, baseUrl = 'https://api.rootly.com') {
    this.token = token;
    this.baseUrl = baseUrl;
  }

  async request(path) {
    const response = await fetch(new URL(path, this.baseUrl), {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.api+json'
      }
    });

    if (!response.ok) {
      throw new Error(`Rootly API request failed for ${path}: ${response.status}`);
    }

    return response.json();
  }

  async getCurrentUser() {
    return this.request('/v1/users/me');
  }

  async listTeams() {
    return this.request('/v1/teams?include=users,schedules,escalation_policies');
  }

  async listSchedules() {
    return this.request('/v1/schedules');
  }

  async listEscalationPolicies() {
    return this.request('/v1/escalation_policies');
  }
}

