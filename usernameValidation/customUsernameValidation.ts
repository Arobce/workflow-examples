import {
	invalidateFormField
} from "@kinde/infrastructure";

export const workflowSettings = {
	id: "onUsernameProvided",
	name: 'Validate username',
	trigger: 'user:new_username_provided',
	failurePolicy: {
		action: "stop",
	},
	bindings: {
		"kinde.widget": {}, // Required for accessing the UI
	},
};

export default async function Workflow(event: any) {
  console.log("Workflow triggered: onUsernameProvided");
  console.log("Event received:", JSON.stringify(event, null, 2));

    

  const banned = ["admin", "root", "test"];
  console.log("Banned usernames:", banned);

  const username = event?.context?.auth?.suppliedUsername;
  console.log("Extracted username:", username);

  if (!username || typeof username !== 'string') {
    console.log("No username provided or username is not a string. Nothing to validate.");
    return;
  }

  // Ensure username is strictly alphanumeric (letters and digits only)
  const alnumRegex = /^[A-Za-z0-9]+$/;
  if (!alnumRegex.test(username)) {
    console.log("Username failed alphanumeric validation. Invalidating form field.");
    invalidateFormField("p_username", "Username must contain only letters and numbers.");
    return;
  }

  if (banned.includes(username)) {
    console.log("Username is banned. Invalidating form field.");
    invalidateFormField("p_username", "This username is not allowed.");
    return;
  }

  console.log("Username is allowed.");
}