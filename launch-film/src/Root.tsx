import { Composition } from "remotion";
import { AppleEdit } from "./apple/AppleEdit";
import { CinematicFilm } from "./cinematic/CinematicFilm";
import { Film } from "./Film";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* authored at 1920x1080: render with --scale=2 for 3840x2160 */}
      <Composition
        id="IsletAppleEdit"
        component={AppleEdit}
        durationInFrames={2040}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* authored at 1080x1920: render with --scale=2 for 2160x3840 */}
      <Composition
        id="IsletAppleEditVertical"
        component={AppleEdit}
        durationInFrames={2040}
        fps={60}
        width={1080}
        height={1920}
      />
      {/* authored at 1920x1080: render with --scale=2 for 3840x2160 */}
      <Composition
        id="IsletCinematic"
        component={CinematicFilm}
        durationInFrames={2400}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="IsletLaunch"
        component={Film}
        durationInFrames={1200}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="IsletLaunchVertical"
        component={Film}
        durationInFrames={1200}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
