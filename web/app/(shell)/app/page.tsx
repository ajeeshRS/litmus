import type { Metadata } from "next";
import Courtroom from "../../courtroom";

export const metadata: Metadata = {title:"Courtroom · Litmus"};
export default function Page() {
  return <Courtroom/>;
}
