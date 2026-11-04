import { useTrainingEmailDeepLink } from "../hooks/useTrainingEmailDeepLink";

// Renders nothing -- exists only to call useTrainingEmailDeepLink from
// inside SkillMatrixNavProvider (see App.jsx), which useGoToTrainingBatches
// needs for setActiveTab/setTrainingBatchTarget/etc. Mounted as a sibling of
// Layout so it still runs even on a first-ever visit, while LandingPage (not
// MainComponent) is what's actually on screen.
export default function TrainingEmailDeepLinkListener() {
  useTrainingEmailDeepLink();
  return null;
}
