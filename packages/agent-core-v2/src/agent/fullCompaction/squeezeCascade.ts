import type { IConfigService } from '#/app/config/config';
import type { IFlagService } from '#/app/flag/flag';
import {
  compactionModelBindingFor,
  resolveCompactionSecondaryModel,
} from '#/session/compaction/configSection';
import type { IAgentProfileService } from '#/agent/profile/profile';

export interface SqueezeCascadeInput {
  readonly currentModelAlias: string;
  readonly profile: IAgentProfileService;
  readonly configService: IConfigService;
  readonly flags: IFlagService;
}

export interface SqueezeCascadeResult {
  readonly alias: string;
  readonly isSqueezed: boolean;
}

export function resolveSqueezeModelAliasWithCascade(
  input: SqueezeCascadeInput,
): SqueezeCascadeResult {
  const { currentModelAlias, profile, configService, flags } = input;
  const overrides = profile.getAllSessionModelOverrides();
  const binding = compactionModelBindingFor(configService, flags, {
    modelAlias: currentModelAlias,
    thinkingLevel: profile.data().thinkingLevel,
  }, { compactionAlias: overrides.compaction });
  const primaryAlias = binding.model;
  if (primaryAlias !== currentModelAlias) {
    try {
      profile.resolveModelContextFor(primaryAlias);
      return { alias: primaryAlias, isSqueezed: true };
    } catch {
    }
  }
  const secondaryAlias = resolveCompactionSecondaryModel(configService, flags, {
    compactionSecondaryAlias: overrides.compactionSecondary,
  });
  if (
    secondaryAlias !== undefined &&
    secondaryAlias !== currentModelAlias &&
    secondaryAlias !== primaryAlias
  ) {
    try {
      profile.resolveModelContextFor(secondaryAlias);
      return { alias: secondaryAlias, isSqueezed: true };
    } catch {
    }
  }
  return { alias: currentModelAlias, isSqueezed: false };
}
