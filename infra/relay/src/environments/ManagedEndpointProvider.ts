import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import type {
  RelayManagedEndpoint,
  RelayManagedEndpointOrigin,
  RelayManagedEndpointRuntimeConfig,
} from "@t3tools/contracts/relay";

// Self-hosted build: managed (Cloudflare-tunnel) endpoint provisioning is disabled.
// Environments are self-managed — clients supply their own endpoint URLs at link time.
// The linker only calls `provision` when a client explicitly requests managed tunnels,
// which now always reports "not configured".

export class ManagedEndpointProvisioningNotConfigured extends Schema.TaggedErrorClass<ManagedEndpointProvisioningNotConfigured>()(
  "ManagedEndpointProvisioningNotConfigured",
  {
    userId: Schema.String,
    environmentId: Schema.String,
    missingSettings: Schema.Array(
      Schema.Literals(["managedEndpointBaseDomain", "managedEndpointNamespace"]),
    ),
  },
) {
  override get message(): string {
    return `Managed endpoint provisioning is not configured for user '${this.userId}', environment '${this.environmentId}': missing ${this.missingSettings.join(", ")}`;
  }
}

const ManagedEndpointProvisioningStage = Schema.Literals([
  "derive-environment-hash",
  "reserve-allocation",
  "ensure-tunnel",
  "validate-tunnel-response",
  "record-tunnel",
  "configure-tunnel",
  "ensure-dns-record",
  "record-dns",
  "get-tunnel-token",
  "mark-allocation-ready",
]);

export class ManagedEndpointProvisioningFailed extends Schema.TaggedErrorClass<ManagedEndpointProvisioningFailed>()(
  "ManagedEndpointProvisioningFailed",
  {
    stage: ManagedEndpointProvisioningStage,
    userId: Schema.String,
    environmentId: Schema.String,
    hostname: Schema.optionalKey(Schema.String),
    tunnelName: Schema.optionalKey(Schema.String),
    tunnelId: Schema.optionalKey(Schema.String),
    dnsRecordId: Schema.optionalKey(Schema.String),
    returnedTunnelName: Schema.optionalKey(Schema.String),
    returnedTunnelId: Schema.optionalKey(Schema.String),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Managed endpoint provisioning failed during '${this.stage}' for user '${this.userId}', environment '${this.environmentId}'`;
  }
}

const ManagedEndpointDeprovisioningStage = Schema.Literals([
  "load-allocation",
  "delete-dns-record",
  "delete-tunnel",
  "remove-allocation",
]);

export class ManagedEndpointDeprovisioningFailed extends Schema.TaggedErrorClass<ManagedEndpointDeprovisioningFailed>()(
  "ManagedEndpointDeprovisioningFailed",
  {
    stage: ManagedEndpointDeprovisioningStage,
    userId: Schema.String,
    environmentId: Schema.String,
    tunnelId: Schema.optionalKey(Schema.String),
    dnsRecordId: Schema.optionalKey(Schema.String),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Managed endpoint deprovisioning failed during '${this.stage}' for user '${this.userId}', environment '${this.environmentId}'`;
  }
}

export class ManagedEndpointOriginNotAllowed extends Schema.TaggedErrorClass<ManagedEndpointOriginNotAllowed>()(
  "ManagedEndpointOriginNotAllowed",
  {
    userId: Schema.String,
    environmentId: Schema.String,
    host: Schema.String,
    port: Schema.Number,
  },
) {
  override get message(): string {
    return `Managed endpoint origin '${this.host}:${this.port}' is not allowed for user '${this.userId}', environment '${this.environmentId}'`;
  }
}

export type ManagedEndpointProviderError =
  | ManagedEndpointProvisioningNotConfigured
  | ManagedEndpointProvisioningFailed
  | ManagedEndpointOriginNotAllowed;

export interface ManagedEndpointProvisioningResult {
  readonly endpoint: RelayManagedEndpoint;
  readonly runtime: RelayManagedEndpointRuntimeConfig;
}

export class ManagedEndpointProvider extends Context.Service<
  ManagedEndpointProvider,
  {
    readonly provision: (input: {
      readonly userId: string;
      readonly environmentId: string;
      readonly origin: RelayManagedEndpointOrigin;
    }) => Effect.Effect<ManagedEndpointProvisioningResult, ManagedEndpointProviderError>;
    readonly deprovision: (input: {
      readonly userId: string;
      readonly environmentId: string;
    }) => Effect.Effect<void, ManagedEndpointDeprovisioningFailed>;
  }
>()("t3code-relay/environments/ManagedEndpointProvider") {}

const make = Effect.succeed(
  ManagedEndpointProvider.of({
    provision: Effect.fn("relay.managed_endpoint_provider.provision")(function* (input) {
      return yield* new ManagedEndpointProvisioningNotConfigured({
        userId: input.userId,
        environmentId: input.environmentId,
        missingSettings: ["managedEndpointBaseDomain", "managedEndpointNamespace"],
      });
    }),
    // Nothing to tear down for self-managed endpoints.
    deprovision: Effect.fn("relay.managed_endpoint_provider.deprovision")(function* () {}),
  }),
);

export const layer = Layer.effect(ManagedEndpointProvider, make);
