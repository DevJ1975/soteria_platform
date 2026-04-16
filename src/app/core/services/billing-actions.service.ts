import { inject, Injectable } from '@angular/core';

import { SupabaseService } from './supabase.service';

interface CheckoutResponse {
  url: string;
  sessionId: string;
}

interface PortalResponse {
  url: string;
}

/**
 * Client-side wrapper over the Stripe-related edge functions.
 *
 * Why separate from `SubscriptionService`
 * ---------------------------------------
 * `SubscriptionService` owns read state + reactive signals. This
 * service is fire-and-forget: invoke an edge function, follow the
 * redirect it hands back. Keeping the two apart means the signal-
 * based UI state doesn't have to know anything about Stripe.
 *
 * All methods throw on non-2xx; callers surface the error message
 * directly to the user. Edge functions return `{ error: string }` on
 * failure, which the Supabase client exposes via `error.message`.
 */
@Injectable({ providedIn: 'root' })
export class BillingActionsService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Kicks off the Stripe Checkout flow for a given plan. Returns the
   * redirect URL; caller does `window.location.href = url` (we don't
   * navigate here because `location` is a side effect that's easier
   * to mock in callers).
   */
  async createCheckoutSession(planId: string): Promise<CheckoutResponse> {
    const { data, error } = await this.supabase.client.functions.invoke<CheckoutResponse>(
      'create-checkout-session',
      { body: { planId, returnUrl: window.location.origin } },
    );
    if (error) throw new Error(error.message);
    if (!data?.url) throw new Error('Checkout session returned no URL.');
    return data;
  }

  /**
   * Opens the Stripe Billing Portal (hosted "manage my subscription"
   * surface). Only works once the tenant has an
   * `external_customer_id` — the edge function returns 409 otherwise.
   */
  async createPortalSession(): Promise<PortalResponse> {
    const { data, error } = await this.supabase.client.functions.invoke<PortalResponse>(
      'create-portal-session',
      { body: { returnUrl: `${window.location.origin}/app/billing` } },
    );
    if (error) throw new Error(error.message);
    if (!data?.url) throw new Error('Portal session returned no URL.');
    return data;
  }
}
