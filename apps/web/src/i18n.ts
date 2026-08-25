import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  fa: {
    translation: {
      login: {
        title: "ورود به ScalpAI",
        email: "ایمیل",
        password: "رمز عبور",
        submit: "ورود",
      },
      home: { title: "خوش آمدید", logout: "خروج" },
    },
  },
  en: {
    translation: {
      login: { title: "Sign in to ScalpAI", email: "Email", password: "Password", submit: "Sign in" },
      home: { title: "Welcome", logout: "Sign out" },
    },
  },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: "fa",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
