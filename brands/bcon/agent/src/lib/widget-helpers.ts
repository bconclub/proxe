/**
 * Client-safe helpers for widget operations that need server-side services.
 * These use fetch() to call API routes instead of importing server-only modules
 * (like bookingManager which imports googleapis and requires Node.js fs/child_process).
 */

// Helper to get absolute API URL (works in iframe)
function getApiUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  if (path.startsWith('http')) return path;
  return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export interface ExistingBookingResult {
  exists: boolean;
  bookingDate?: string;
  bookingTime?: string;
  bookingStatus?: string;
}

/**
 * Check if a user already has an existing booking.
 * Calls the calendar book API with a check-only flag,
 * or directly queries via a lightweight endpoint.
 */
export async function checkExistingBookingClient(
  phone?: string | null,
  email?: string | null,
): Promise<ExistingBookingResult> {
  if (!phone && !email) return { exists: false };

  try {
    const response = await fetch(getApiUrl('/api/agent/calendar/book'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkOnly: true,
        phone: phone || '',
        email: email || '',
      }),
    });

    if (!response.ok) return { exists: false };

    const data = await response.json();
    if (data.alreadyBooked) {
      return {
        exists: true,
        bookingDate: data.bookingDate,
        bookingTime: data.bookingTime,
        bookingStatus: data.bookingStatus,
      };
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Store a booking by calling the calendar book API.
 * The actual storage is handled server-side.
 */
export async function storeBookingClient(
  sessionId: string,
  bookingData: {
    date: string;
    time: string;
    googleEventId?: string;
    status?: string;
    name: string;
    email: string;
    phone: string;
  },
): Promise<boolean> {
  try {
    const response = await fetch(getApiUrl('/api/agent/calendar/book'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: bookingData.date,
        time: bookingData.time,
        name: bookingData.name,
        email: bookingData.email,
        phone: bookingData.phone,
        sessionId,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
