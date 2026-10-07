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
    return {
      id: "expo-eas",
      label: "Expo / EAS",
      status: "not_integrated",
      requiredEnvironment: ["EXPO_TOKEN"],
      message: "Mobile builds are unavailable until an Expo/EAS build adapter is implemented and configured.",
    };
  }

  return {
    id: "godot-build-service",
    label: "Godot build service",
    status: "not_integrated",
    requiredEnvironment: ["GODOT_BUILD_SERVICE_URL", "GODOT_BUILD_SERVICE_TOKEN"],
    message: "Game builds are unavailable until a Godot build adapter is implemented and configured.",
  };
}