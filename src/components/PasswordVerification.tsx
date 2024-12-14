import { useState, useEffect } from 'react';
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

interface PasswordVerificationProps {
  onVerified: () => void;
}

export default function PasswordVerification({ onVerified }: PasswordVerificationProps) {
  const [password, setPassword] = useState('');

  useEffect(() => {
    const isVerified = sessionStorage.getItem('isVerified');
    if (isVerified === 'true') {
      onVerified();
    }
  }, [onVerified]);

  const handleVerify = () => {
    if (password === import.meta.env.VITE_APP_PASSWORD) {
      sessionStorage.setItem('isVerified', 'true');
      onVerified();
    } else {
      toast.error("密码错误", {
        position: "top-right",
        autoClose: 2000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        theme: "light",
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex items-center justify-center">
      <ToastContainer />
      <div className="w-[400px] p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold mb-4 text-center dark:text-white">
          验证访问权限
        </h2>
        <p className="text-gray-600 dark:text-gray-300 text-center mb-4">
          请输入访问密码以继续
        </p>
        <Input
          type="password"
          className="w-full px-4 py-2 mb-4 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          placeholder="请输入密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
        />
        <Button
          className="w-full bg-violet-500 hover:bg-violet-600 active:bg-violet-700 text-white"
          onClick={handleVerify}
        >
          验证
        </Button>
      </div>
    </div>
  );
} 