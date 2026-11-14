import type { Metadata } from "next";
import Replay from "../../replay";

export const metadata: Metadata = {title:"Replay · Litmus"};
export default function Page() {
  return <Replay/>;
}
