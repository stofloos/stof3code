import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

export class RelayConfiguration extends Context.Service<
  RelayConfiguration,
  {
    readonly relayIssuer: string;
    // Cloud mint keypair: signs DPoP access tokens and link challenges (EdDSA PEM).
    readonly cloudMintPrivateKey: Redacted.Redacted<string>;
    readonly cloudMintPublicKey: string;
    // Auth session keypair: signs login session JWTs (relay-as-IdP, EdDSA PEM).
    readonly authSessionPrivateKey: Redacted.Redacted<string>;
    readonly authSessionPublicKey: string;
    // Optional invite code gating new-user registration. `null` = open registration.
    readonly registrationInviteCode: Redacted.Redacted<string> | null;
    // Managed (Cloudflare-tunnel) endpoints are disabled in the self-hosted build;
    // these stay `undefined` so ManagedEndpointProvider runs in self-managed mode.
    readonly managedEndpointBaseDomain: string | undefined;
    readonly managedEndpointNamespace: string | undefined;
  }
>()("t3code-relay/Config/RelayConfiguration") {}

export const make = (configuration: RelayConfiguration["Service"]) =>
  RelayConfiguration.of(configuration);

export const layer = (configuration: RelayConfiguration["Service"]) =>
  Layer.succeed(RelayConfiguration, make(configuration));
