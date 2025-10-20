import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = LoginViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Email")
                        .font(.subheadline)
                        .bold()
                        .frame(maxWidth: .infinity, alignment: .leading)
                    TextField("demo@bissbilanz.ch", text: $viewModel.email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                        .padding(12)
                        .background(Color(.secondarySystemBackground))
                        .cornerRadius(8)

                    Text("Password")
                        .font(.subheadline)
                        .bold()
                        .frame(maxWidth: .infinity, alignment: .leading)
                    SecureField("••••••••", text: $viewModel.password)
                        .textContentType(.password)
                        .padding(12)
                        .background(Color(.secondarySystemBackground))
                        .cornerRadius(8)
                }

                if let token = viewModel.token {
                    VStack(spacing: 8) {
                        Text("Authenticated!")
                            .font(.headline)
                        Text("Token: \(token)")
                            .font(.footnote)
                            .multilineTextAlignment(.center)
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.green.opacity(0.15))
                    .cornerRadius(12)
                }

                if let error = viewModel.errorMessage {
                    Text(error)
                        .foregroundColor(.red)
                        .multilineTextAlignment(.center)
                }

                Button(action: viewModel.login) {
                    if viewModel.isLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle())
                    } else {
                        Text("Log In")
                            .fontWeight(.semibold)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!viewModel.canSubmit)

                Spacer()
            }
            .padding()
            .navigationTitle("Bissbilanz Login")
        }
    }
}

#Preview {
    ContentView()
}
