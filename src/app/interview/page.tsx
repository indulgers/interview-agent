import { createContentSnapshot } from '../../modules/interview-content/content';
import { InterviewExperience } from '../../features/interview-room/InterviewExperience';

export default function InterviewPage() {
  return <InterviewExperience snapshot={createContentSnapshot()} />;
}
