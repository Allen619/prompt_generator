import { HEADER_TITLE } from "../lib/Language";
import { cn } from "../utils";
import logo from "../assets/logo.png";

export default function Header({ language }: { language: 'chinese' | 'english' | 'japanese' }) {
  const showBrand = true
  return (
    <div className="relative flex justify-center items-center my-8 gap-1">
      {showBrand &&
        <img
          src={logo}
          className={cn(
            "app-icon object-contain"
          )}
          alt="logo"
          height={60}
          width={60}
        />
      }
      <div className={cn("app-title")}>{HEADER_TITLE[language]}</div>
    </div>
  );
}
