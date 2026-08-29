import { createContentSnapshot } from '../../modules/interview-content/content';
import { InterviewExperience } from '../../features/interview-room/InterviewExperience';

export default function InterviewPage() {
  return <InterviewExperience snapshot={createContentSnapshot()} testMode={process.env.INTERVIEW_COMPILED_TEST_MODE === '1'} />;
}
