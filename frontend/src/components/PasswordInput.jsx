import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export const PasswordInput = ({ className = "", wrapperClassName = "", testid, ...props }) => {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative flex-1 w-full ${wrapperClassName}`}>
      <input data-testid={testid} {...props} type={show ? "text" : "password"} className={`${className} pr-9`} />
      <button type="button" data-testid={`${testid}-toggle`} aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 p-1">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};
