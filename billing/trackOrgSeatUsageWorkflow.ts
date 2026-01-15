import {
    onPostAuthenticationEvent,
    WorkflowSettings,
    WorkflowTrigger,
    createKindeAPI,
} from "@kinde/infrastructure";

/**
 * Workflow: Track Per-User (Seat-Based) Billing Usage in Kinde
 *
 * This workflow is designed for a standard B2B SaaS setup in Kinde, where:
 * - Organizations are billed per active user (seat-based pricing)
 * - Billing is managed by organization administrators
 * - Users can join organizations via orgCode, allowed domains, or custom invite flows
 *
 * This workflow should be triggered after user authentication (PostAuthentication event).
 * It ensures that whenever a new user is added to an organization, the metered usage for the
 * 'user' feature is updated for accurate seat-based billing.
 *
 * Prerequisites:
 * 1. Connect your Stripe account in the Kinde dashboard.
 * 2. Create and publish a per-user (seat-based) billing plan with a metered feature key 'user'.
 * 3. Assign the Billing Admin role to organization creators.
 * 4. Enable organization creation and joining via orgCode or allowed domains.
 * 5. Set up a Kinde M2M application with the following scopes:
 *    - read:organizations
 *    - create:meter_usage
 * 6. Add the following environment variables in Kinde:
 *    - KINDE_WF_M2M_CLIENT_ID
 *    - KINDE_WF_M2M_CLIENT_SECRET (set as sensitive)
 *
 * Usage:
 * - This workflow should be used to report seat usage whenever a user is added to an organization.
 * - It can be extended to handle removals or scheduled reconciliation jobs for true-up billing.
 *
 * For more details, see the Kinde B2B SaaS billing guide.
 */

export const workflowSettings: WorkflowSettings = {
    id: "trackOrgSeatUsage",
    name: "Track Organization Seat Usage",
    failurePolicy: {
        action: "stop",
    },
    trigger: WorkflowTrigger.PostAuthentication,
    bindings: {
        "kinde.env": {},
        "kinde.fetch": {},
        url: {},
    },
};

// The workflow code to be executed when the event is triggered
/**
 * PostAuthentication workflow handler to track seat usage for billing.
 *
 * Triggered when a user is added to the Kinde user pool for the first time (isNewUserRecordCreated).
 * Looks up the organization and plan, and updates metered usage for the 'user' feature.
 */
export default async function trackOrgSeatUsage(event: onPostAuthenticationEvent) {
    console.log('[DEBUG] trackOrgSeatUsage triggered', { event });
    const isNewKindeUser = event.context.auth.isNewUserRecordCreated;
    const orgCode = event.request.authUrlParams.orgCode;
    console.log('[DEBUG] orgCode from authUrlParams:', orgCode);
    console.log('[DEBUG] isNewKindeUser:', isNewKindeUser);

    if (!orgCode) {
        console.log('[DEBUG] No orgCode found in authUrlParams. Exiting workflow safely.');
        return;
    }

    // Only update usage if this is a new user record
    if (isNewKindeUser) {
        const kindeUserId = event.context.user.id;
        console.log('[DEBUG] New Kinde user ID:', kindeUserId);

        // Create Kinde Management API client
        const kindeAPI = await createKindeAPI(event);
        console.log('[DEBUG] Kinde API client created');

        // Fetch organization details (including billing info)
        const orgResponse = await kindeAPI.get({
            endpoint: `organization?code=${orgCode}&expand=billing`,
        });
        console.log('[DEBUG] orgResponse:', orgResponse);

        const organization = orgResponse.data;
        console.log('[DEBUG] organization:', organization);
        const planCode = "standard-organization-plan"; // Update if your plan code differs
        console.log('[DEBUG] planCode:', planCode);

        // Find the correct billing agreement for the plan
        const agreement = organization.billing.agreements.find(
            (agr: any) => agr.plan_code === planCode
        );
        console.log('[DEBUG] agreement:', agreement);

        if (!agreement) {
            console.log(
                `[INFO] Organization ${orgCode} is not on plan ${planCode}. Skipping metered usage update.`
            );
            return;
        }

        const billingCustomerAgreementId = agreement.agreement_id;
        console.log('[DEBUG] billingCustomerAgreementId:', billingCustomerAgreementId);

        const billingFeatureCode = "user"; // Must match your metered feature key
        console.log('[DEBUG] billingFeatureCode:', billingFeatureCode);

        // Update metered usage for the organization (increment seat count)
        console.log('[DEBUG] Posting metered usage update', {
            customer_agreement_id: billingCustomerAgreementId,
            billing_feature_code: billingFeatureCode,
            meter_value: "1",
            meter_type_code: "delta",
        });
        const meterUsageResponse = await kindeAPI.post({
            endpoint: `billing/meter_usage`,
            params: {
                customer_agreement_id: billingCustomerAgreementId,
                billing_feature_code: billingFeatureCode,
                meter_value: "1",
                meter_type_code: "delta",
            },
        });
        console.log('[DEBUG] meterUsageResponse:', meterUsageResponse);

        console.log(
            `[INFO] Metered usage updated for organization ${orgCode} and user ${kindeUserId}`
        );
    }
}