import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorInfo?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo: error.message });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center text-red-600">
          <h2 className="text-2xl font-bold mb-4">Algo salió mal</h2>
          <p className="mb-2">Se produjo un error inesperado. Por favor, recargue la página o intente de nuevo más tarde.</p>
          {this.state.errorInfo && <pre className="text-sm bg-red-100 p-2 rounded">{this.state.errorInfo}</pre>}
        </div>
      );
    }
    return this.props.children;
  }
}
