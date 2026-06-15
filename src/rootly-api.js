const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class RootlyApiClient {
  constructor(token, baseUrl = 'https://api.rootly.com') {
    this.token = token;
    this.baseUrl = baseUrl;
  }

  async request(path, options = {}) {
    const response = await fetch(new URL(path, this.baseUrl), {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.api+json',
        ...(options.body ? { 'Content-Type': 'application/vnd.api+json' } : {}),
        ...(options.headers || {})
      },
      signal: options.signal || AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Rootly API request failed for ${path}: ${response.status}${text ? ` - ${text}` : ''}`);
    }

    return response.json();
  }

  async getCurrentUser() {
    return this.request('/v1/users/me');
  }

  async listTeams() {
    return this.request('/v1/teams?include=users,schedules,escalation_policies');
  }

  async getTeam(id) {
    return this.request(`/v1/teams/${id}?include=users`);
  }

  async listUsers() {
    return this.request('/v1/users');
  }

  async listAllUsers() {
    const users = [];
    let next = '/v1/users';
    let pagesScanned = 0;

    while (next && pagesScanned < 100) {
      pagesScanned += 1;
      const payload = await this.request(next);
      if (Array.isArray(payload?.data)) {
        users.push(...payload.data);
      }
      next = payload?.links?.next || null;
    }

    return users;
  }

  async listSchedules() {
    return this.request('/v1/schedules');
  }

  async listEscalationPolicies() {
    return this.request('/v1/escalation_policies');
  }

  async listSeverities() {
    return this.request('/v1/severities');
  }

  async listServices() {
    return this.request('/v1/services');
  }

  async listEnvironments() {
    return this.request('/v1/environments');
  }

  async listIncidentTypes() {
    return this.request('/v1/incident_types');
  }

  async createTeam(attributes) {
    return this.request('/v1/teams', {
      method: 'POST',
      body: {
        data: {
          type: 'groups',
          attributes
        }
      }
    });
  }

  async updateTeam(id, attributes) {
    return this.request(`/v1/teams/${id}`, {
      method: 'PUT',
      body: {
        data: {
          type: 'groups',
          attributes
        }
      }
    });
  }

  async createSchedule(attributes) {
    return this.request('/v1/schedules', {
      method: 'POST',
      body: {
        data: {
          type: 'schedules',
          attributes
        }
      }
    });
  }

  async createScheduleRotation(scheduleId, attributes) {
    return this.request(`/v1/schedules/${scheduleId}/schedule_rotations`, {
      method: 'POST',
      body: {
        data: {
          type: 'schedule_rotations',
          attributes
        }
      }
    });
  }

  async createEscalationPolicy(attributes) {
    return this.request('/v1/escalation_policies', {
      method: 'POST',
      body: {
        data: {
          type: 'escalation_policies',
          attributes
        }
      }
    });
  }

  async createEscalationPath(escalationPolicyId, attributes) {
    return this.request(`/v1/escalation_policies/${escalationPolicyId}/escalation_paths`, {
      method: 'POST',
      body: {
        data: {
          type: 'escalation_paths',
          attributes
        }
      }
    });
  }

  async createEscalationLevel(escalationPolicyId, attributes) {
    return this.request(`/v1/escalation_policies/${escalationPolicyId}/escalation_levels`, {
      method: 'POST',
      body: {
        data: {
          type: 'escalation_levels',
          attributes
        }
      }
    });
  }

  async listAlertUrgencies() {
    return this.request('/v1/alert_urgencies');
  }

  async createAlertSource(attributes) {
    return this.request('/v1/alert_sources', {
      method: 'POST',
      body: {
        data: {
          type: 'alert_sources',
          attributes
        }
      }
    });
  }

  async createAlert(attributes) {
    return this.request('/v1/alerts', {
      method: 'POST',
      body: {
        data: {
          type: 'alerts',
          attributes
        }
      }
    });
  }

  async createIncident(attributes) {
    return this.request('/v1/incidents', {
      method: 'POST',
      body: {
        data: {
          type: 'incidents',
          attributes
        }
      }
    });
  }

  async createUserPhoneNumber(userId, phone) {
    return this.request(`/v1/users/${userId}/phone_numbers`, {
      method: 'POST',
      body: {
        data: {
          type: 'user_phone_numbers',
          attributes: { phone }
        }
      }
    });
  }

  // Triggers a Twilio SMS with a verification code (member route is shallow).
  async sendPhoneVerification(phoneNumberId) {
    return this.request(`/v1/phone_numbers/${phoneNumberId}/verify`, { method: 'POST' });
  }

  async submitPhoneVerificationCode(phoneNumberId, code) {
    return this.request(`/v1/phone_numbers/${phoneNumberId}/verify_code`, {
      method: 'PATCH',
      body: { code }
    });
  }

  async resendPhoneVerification(phoneNumberId) {
    return this.request(`/v1/phone_numbers/${phoneNumberId}/resend_verification`, { method: 'POST' });
  }

  async deleteUserPhoneNumber(phoneNumberId) {
    return this.request(`/v1/phone_numbers/${phoneNumberId}`, { method: 'DELETE' });
  }

  async findUserByEmail(email) {
    const target = String(email).toLowerCase();
    let next = '/v1/users';
    let pagesScanned = 0;

    while (next && pagesScanned < 100) {
      pagesScanned += 1;
      const payload = await this.request(next);
      const match = payload?.data?.find((user) => user?.attributes?.email?.toLowerCase() === target);
      if (match) {
        return match;
      }

      next = payload?.links?.next || null;
    }

    return null;
  }
}
