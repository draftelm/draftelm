import type { Metadata } from "next";
import Navbar from "../../components/Navbar";
import FurniturePreview from "../../components/furniture/FurniturePreview";

export const metadata: Metadata = {
  title: "Furniture Preview | DRAFTELM",
  description: "Preliminary parametric furniture assembly preview. Not approved for manufacturing.",
};

export default function FurniturePage() {
  return <main className="min-h-screen bg-[#0B1120] text-white"><Navbar /><FurniturePreview /></main>;
}
