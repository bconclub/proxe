import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

type IconComponent = React.FC<IconProps>;

interface HugeiconsIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  icon: IconComponent;
  size?: number;
  stroke?: string;
  strokeWidth?: number;
}

export const HugeiconsIcon: React.FC<HugeiconsIconProps> = ({
  icon: Icon,
  size = 28,
  className,
  stroke = 'currentColor',
  strokeWidth = 1.5,
  ...rest
}) => (
  <span
    className={className}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
    {...rest}
  >
    <Icon width={size} height={size} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
  </span>
);

const strokeColor = 'currentColor';

export const BrowserIcon: IconComponent = (props: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} color={"currentColor"} fill={"none"} {...props}>
      <defs>
        <linearGradient id="webIconGradientLocal" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="url(#webIconGradient)" strokeWidth="1.5" fill="none"></path>
      <path d="M3.5 9H20.5" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"></path>
      <circle cx="7" cy="6" r="0.75" fill="url(#webIconGradient)" stroke="none"></circle>
      <circle cx="11" cy="6" r="0.75" fill="url(#webIconGradient)" stroke="none"></circle>
    </svg>
  );
};

export const WhatsappIcon: IconComponent = ({ stroke = strokeColor, strokeWidth = 1.5, ...props }) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path
      d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.3789 2.27907 14.6926 2.78382 15.8877C3.06278 16.5481 3.20226 16.8784 3.21953 17.128C3.2368 17.3776 3.16334 17.6521 3.01642 18.2012L2 22L5.79877 20.9836C6.34788 20.8367 6.62244 20.7632 6.87202 20.7805C7.12161 20.7977 7.45185 20.9372 8.11235 21.2162C9.30745 21.7209 10.6211 22 12 22Z"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
    <path
      d="M12.8824 12C14.0519 12 15 13.0074 15 14.25C15 15.4926 14.0519 16.5 12.8824 16.5H10.4118C9.74625 16.5 9.4135 16.5 9.20675 16.2972C9 16.0945 9 15.7681 9 15.1154V12M12.8824 12C14.0519 12 15 10.9926 15 9.75C15 8.50736 14.0519 7.5 12.8824 7.5H10.4118C9.74625 7.5 9.4135 7.5 9.20675 7.70277C9 7.90554 9 8.2319 9 8.88462V12M12.8824 12H9"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const AiVoiceIcon: IconComponent = ({ stroke = strokeColor, strokeWidth = 1.5, ...props }) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path
      d="M9 11V14"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11.5 3C7.27027 3 5.1554 3 3.75276 4.19797C3.55358 4.36808 3.36808 4.55358 3.19797 4.75276C2 6.1554 2 8.27027 2 12.5C2 16.7297 2 18.8446 3.19797 20.2472C3.36808 20.4464 3.55358 20.6319 3.75276 20.802C5.1554 22 7.27027 22 11.5 22C15.7297 22 17.8446 22 19.2472 20.802C19.4464 20.6319 19.6319 20.4464 19.802 20.2472C21 18.8446 21 16.7297 21 12.5"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 8V17"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15 10V15"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 12V13"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15.3881 5.08714C16.796 4.91193 17.9119 3.79602 18.0871 2.38812C18.1137 2.17498 18.2852 2 18.5 2C18.7148 2 18.8863 2.17498 18.9129 2.38812C19.0881 3.79602 20.204 4.91193 21.6119 5.08714C21.825 5.11366 22 5.28522 22 5.5C22 5.71478 21.825 5.88634 21.6119 5.91286C20.204 6.08807 19.0881 7.20398 18.9129 8.61188C18.8863 8.82502 18.7148 9 18.5 9C18.2852 9 18.1137 8.82502 18.0871 8.61188C17.9119 7.20398 16.796 6.08807 15.3881 5.91286C15.175 5.88634 15 5.71478 15 5.5C15 5.28522 15.175 5.11366 15.3881 5.08714Z"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const VideoAiIcon: IconComponent = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path
      d="M18.9737 15.0215C18.9795 14.9928 19.0205 14.9928 19.0263 15.0215C19.3302 16.5081 20.4919 17.6698 21.9785 17.9737C22.0072 17.9795 22.0072 18.0205 21.9785 18.0263C20.4919 18.3302 19.3302 19.4919 19.0263 20.9785C19.0205 21.0072 18.9795 21.0072 18.9737 20.9785C18.6698 19.4919 17.5081 18.3302 16.0215 18.0263C15.9928 18.0205 15.9928 17.9795 16.0215 17.9737C17.5081 17.6698 18.6698 16.5081 18.9737 15.0215Z"
      stroke={strokeColor}
      strokeWidth={1.5}
    />
    <path
      d="M14.6469 12.6727C15.3884 12.1531 15.7591 11.8934 15.9075 11.5158C16.0308 11.2021 16.0308 10.7979 15.9075 10.4842C15.7591 10.1066 15.3884 9.84685 14.6469 9.3273C14.1274 8.9633 13.5894 8.60214 13.1167 8.3165C12.7229 8.07852 12.2589 7.82314 11.7929 7.57784C11.005 7.16312 10.6111 6.95576 10.2297 7.00792C9.91348 7.05115 9.58281 7.25237 9.38829 7.5199C9.1536 7.84266 9.12432 8.30677 9.06577 9.23497C9.02725 9.84551 9 10.4661 9 11C9 11.5339 9.02725 12.1545 9.06577 12.765C9.12432 13.6932 9.1536 14.1573 9.38829 14.4801C9.58281 14.7476 9.91348 14.9489 10.2297 14.9921C10.6111 15.0442 11.005 14.8369 11.7929 14.4221C12.2589 14.1768 12.7229 13.9215 13.1167 13.6835C13.5894 13.3978 14.1274 13.0367 14.6469 12.6727Z"
      stroke={strokeColor}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
    <path
      d="M21.872 14.8357C22 13.9227 22 12.7279 22 11C22 8.19974 22 6.79961 21.455 5.73005C20.9757 4.78924 20.2108 4.02433 19.27 3.54497C18.2004 3 16.8003 3 14 3H10C7.19974 3 5.79961 3 4.73005 3.54497C3.78924 4.02433 3.02433 4.78924 2.54497 5.73005C2 6.79961 2 8.19974 2 11C2 13.8003 2 15.2004 2.54497 16.27C3.02433 17.2108 3.78924 17.9757 4.73005 18.455C5.79961 19 7.19974 19 10 19H13.4257"
      stroke={strokeColor}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const CallIcon: IconComponent = ({ stroke = strokeColor, strokeWidth = 1.5, ...props }) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path
      d="M22 16.92V19.92C22.0011 20.1985 21.9441 20.4742 21.8325 20.7292C21.7209 20.9842 21.5573 21.2136 21.3522 21.4029C21.1472 21.5922 20.9053 21.7371 20.6393 21.8292C20.3733 21.9212 20.0891 21.9582 19.8067 21.9381C16.7427 21.5857 13.787 20.5341 11.19 18.86C8.77382 17.3146 6.72533 15.2661 5.18001 12.85C3.49996 10.2412 2.44824 7.27099 2.10101 4.19C2.081 3.90784 2.11798 3.62384 2.21001 3.358C2.30205 3.09216 2.44692 2.85038 2.63618 2.64543C2.82544 2.44048 3.05489 2.27689 3.30989 2.16527C3.56489 2.05365 3.84059 1.99658 4.11901 1.99768H7.11901C7.59386 1.99542 8.05806 2.16707 8.42201 2.48268C8.78595 2.7983 9.02473 3.23905 9.09501 3.72C9.22078 4.68008 9.45801 5.62274 9.80001 6.53C9.94401 6.88791 9.97382 7.28675 9.88501 7.66498C9.79619 8.04321 9.59301 8.38359 9.30501 8.64L8.09501 9.85C9.5137 12.3825 11.6175 14.4863 14.15 15.905L15.36 14.7C15.6164 14.4119 15.9568 14.2087 16.3351 14.1199C16.7133 14.0311 17.1121 14.0609 17.47 14.205C18.3773 14.5471 19.32 14.7844 20.28 14.91C20.7656 14.9793 21.2103 15.2186 21.5263 15.5834C21.8424 15.9481 22.0123 16.4141 22.01 16.89L22 16.92Z"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const EmailIcon: IconComponent = ({ stroke = strokeColor, strokeWidth = 1.5, ...props }) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path
      d="M2 12C2 8.22876 2 6.34315 3.17157 5.17157C4.34315 4 6.22876 4 10 4H14C17.7712 4 19.6569 4 20.8284 5.17157C22 6.34315 22 8.22876 22 12C22 15.7712 22 17.6569 20.8284 18.8284C19.6569 20 17.7712 20 14 20H10C6.22876 20 4.34315 20 3.17157 18.8284C2 17.6569 2 15.7712 2 12Z"
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
    <path
      d="M6 8L10.1597 10.7991C11.2169 11.5101 11.7456 11.8656 12.3249 11.8656C12.9043 11.8656 13.433 11.5101 14.4902 10.7991L18.6499 8"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const SmsIcon: IconComponent = ({ stroke = "currentColor", strokeWidth = 1.5, ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} color={"currentColor"} fill={"none"} {...props}>
    <path d="M8.5 14.5H15.5M8.5 9.5H12" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"></path>
    <path d="M14.1706 20.8905C18.3536 20.6125 21.6856 17.2332 21.9598 12.9909C22.0134 12.1607 22.0134 11.3009 21.9598 10.4707C21.6856 6.22838 18.3536 2.84913 14.1706 2.57107C12.7435 2.47621 11.2536 2.47641 9.8294 2.57107C5.64639 2.84913 2.31441 6.22838 2.04024 10.4707C1.98659 11.3009 1.98659 12.1607 2.04024 12.9909C2.1401 14.536 2.82343 15.9666 3.62791 17.1746C4.09501 18.0203 3.78674 19.0758 3.30021 19.9978C2.94941 20.6626 2.77401 20.995 2.91484 21.2351C3.05568 21.4752 3.37026 21.4829 3.99943 21.4982C5.24367 21.5285 6.08268 21.1757 6.74868 20.6846C7.1264 20.4061 7.31527 20.2668 7.44544 20.2508C7.5756 20.2348 7.83177 20.3403 8.34401 20.5513C8.8044 20.7409 9.33896 20.8579 9.8294 20.8905C11.2536 20.9852 12.7435 20.9854 14.1706 20.8905Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round"></path>
  </svg>
);


