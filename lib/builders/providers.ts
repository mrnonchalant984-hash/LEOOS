import type { ProjectType } from "@/lib/pricing";

export type BuilderAvailability = {
  id: string;
  label: string;
  status: "ready" | "not_configured" | "not_integrated";
  requiredEnvironment: string[];
  message?: string;
};

const webProvider = {
  id: "vercel-nextjs",
  label: "Next.js on GitHub and Vercel",
  requiredEnvironment: ["OPENAI_API_KEY", "GITHUB_TOKEN", "VERCEL_TOKEN"],
};

export const supportedProjectTypes: ProjectType[] = [
  "website",
  "web_app",
  "saas",
  "mobile_app",
  "game",
];

export function getBuilderAvailability(projectType: ProjectType): BuilderAvailability {
  if (["website", "web_app", "saas"].includes(projectType)) {
    const missing = webProvider.requiredEnvironment.filter((key) => !process.env[key]);
    return {
      ...webProvider,
      status: missing.length ? "not_configured" : "ready",
      ...(missing.length
        ? { message: `Configure ${missing.join(", ")} to enable the web builder.` }
        : {}),
    };
  }

  if (projectType === "mobile_app") {
    const requiredEnvironment = ["EXPO_TOKEN"];
    const missing = requiredEnvironment.filter((key) => !process.env[key]?.trim());
    return {
      id: "expo-eas",
      label: "Expo / EAS",
      status: missing.length ? "not_configured" : "ready",
      requiredEnvironment,
      ...(missing.length ? { message: `Configure ${missing.join(", ")} on the server to enable Expo builds.` } : {}),
    };
  }

  const requiredEnvironment = ["GODOT_BUILD_SERVICE_URL", "GODOT_BUILD_SERVICE_TOKEN"];
  const missing = requiredEnvironment.filter((key) => !process.env[key]?.trim());
  return {
    id: "godot-build-service",
    label: "Godot build service",
    status: missing.length ? "not_configured" : "ready",
    requiredEnvironment,
    ...(missing.length ? { message: `Configure ${missing.join(", ")} on the server to enable Godot builds.` } : {}),
  };
}

export function getExternalModelBuilderAvailability(
  projectType: ProjectType,
  environment: NodeJS.ProcessEnv = process.env,
): BuilderAvailability {
  if (!["website", "web_app", "saas"].includes(projectType)) {
    return getBuilderAvailability(projectType);
  }
  const requiredEnvironment = ["GITHUB_TOKEN", "VERCEL_TOKEN"];
  const missing = requiredEnvironment.filter((key) => !environment[key]);
  return {
    id: "vercel-nextjs",
    label: "Next.js on GitHub and Vercel",
    requiredEnvironment,
    status: missing.length ? "not_configured" : "ready",
    ...(missing.length
      ? { message: `Configure ${missing.join(", ")} to enable external-model deployments.` }
      : {}),
  };
}
